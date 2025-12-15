#!usr/bin/env python3
from __future__ import annotations

import asyncio
import base64
import copy
from fileinput import filename
import gc
import io
import logging
import os
import sys
import threading
import time
from dataclasses import dataclass, fields
from pathlib import Path
from typing import Dict, List, Optional, Type, Any, get_type_hints
from fractions import Fraction
import random
import PIL

import torch
from diffusers import Flux2Pipeline
from transformers import Mistral3ForConditionalGeneration, BitsAndBytesConfig
from mistral_common.protocol.instruct.request import ChatCompletionRequest
from mistral_common.tokens.tokenizers.mistral import MistralTokenizer

from diffusers.utils import load_image
from huggingface_hub import snapshot_download
from PIL import Image

from pytrickle import StreamProcessor, VideoFrame, AudioFrame
from pytrickle.decorators import (
    model_loader,
    on_stream_start,
    on_stream_stop,
    param_updater,
    video_handler,
)

import torchvision.transforms as T
pil_to_tensor = T.ToTensor()

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

def pil_to_bhwc(img: Image.Image) -> torch.Tensor:
    t = pil_to_tensor(img)     # [C, H, W], float32 in 0–1
    t = t.permute(1, 2, 0)     # [H, W, C]
    t = t.unsqueeze(0)         # [B, H, W, C]
    return t

@dataclass
class InfiniteFlux2Config:
    prompt: str = "abstract watercolor sunset"
    height: int = 1024
    width: int = 1024
    reference_images: list[str] = None
    steps: int = 28
    guidance_scale: float = 4.0
    seed : int = 42
    seed_adjustment: str = "increment"  #none, random, increment, decrement
    enhance_prompt: bool = False
    enhance_guidance: str = "none"
    
    #processed inputs to use for generation
    processed_reference_images: list["Image.Image"] = None
    prompt_guidance_doc: str = "" #read from flux2_prompting.md file on load

class InfiniteFlux2StreamHandlers:
    """Handlers for InfiniteFlux2 video generation with direct tensor inference."""

    def __init__(self) -> None:
        self.cfg = InfiniteFlux2Config()
        self.processor = None
        self.background_tasks: List[asyncio.Task] = []
        self.background_task_started = False
        
        # Runner for direct inference
        self.pipe = None
        self.text_encoder = None
        self.text_tokenizer = None
        self.runner_ready = False
        
        # Inference locking mechanism with callback-based interruption
        self.inference_lock = asyncio.Lock()
        self.inference_in_progress = False
        self.inference_count = 0
        self.interrupt_requested = False
        self.inference_completed_event = asyncio.Event()
        
        # Generation completion tracking
        self.frame_queue = asyncio.Queue()
        self.frame_queue_lock = asyncio.Lock()
        # Streaming state
        self.frame_timestamp = 0
        self.time_base = 90000  # Standard video timebase
        self.time_base_frac = Fraction(1, self.time_base)
        self.fps = 16  # Target FPS for generation
        self.timestamp_increment = self.time_base // self.fps  # Increment per frame at 16 fps
        self.placeholder_frame = None
        self.current_frame = None
        self.no_audio_in_stream = True

    def load_prompt_guide(self, file_path: str) -> str:
        """Load prompt guidance document from file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                guide_text = f.read()
            return guide_text
        except Exception as e:
            logger.error(f"Error loading prompt guidance document: {e}")
            return ""
        
    def enhance_prompt(self, prompt: str) -> str:
        instruction = f"""
        You are a prompt enhancement engine.

        Rewrite the following prompt to be:
        - more descriptive
        - vivid and precise
        - suitable for a text-to-image model
        - without changing the original intent
        - no negative prompts
        - no commentary, only the final enhanced prompt
        - {self.cfg.enhance_guidance}

        Guide to good prompt: {self.cfg.prompt_guidance_doc}
        Original prompt:
        """.strip()
        
        messages = [
            {"role": "system", "content": instruction},
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    },
                ],
            },
        ]
        tokenized = self.text_tokenizer.encode_chat_completion(ChatCompletionRequest(messages=messages))
        input_ids = torch.tensor([tokenized.tokens]).to("cuda")
        attention_mask = torch.ones_like(input_ids)

        output = self.text_encoder.generate(input_ids=input_ids, attention_mask=attention_mask, max_new_tokens=32768)[0]

        return self.text_tokenizer.decode(output[len(tokenized.tokens) :])
    
    async def create_placeholder_frame(self):
        #create placeholder image for frames until first generation completed
            height = self.cfg.height
            width = self.cfg.width

            img = Image.new("RGB", (width, height))

            # Calculate square size to create a reasonable checkerboard pattern
            # Aim for 16 squares per dimension as a baseline
            target_squares_per_dim = 16
            square_size = min(width, height) // target_squares_per_dim

            # Calculate actual number of squares that fit
            num_rows = height // square_size
            num_cols = width // square_size

            for row in range(num_rows):
                for col in range(num_cols):
                    # Alternate between black and white based on position
                    is_black = (row + col) % 2 == 0
                    color = (0, 0, 0) if is_black else (255, 255, 255)

                    # Fill the current square
                    y_start = row * square_size
                    y_end = (row + 1) * square_size
                    x_start = col * square_size
                    x_end = (col + 1) * square_size

                    for y in range(y_start, min(y_end, height)):
                        for x in range(x_start, min(x_end, width)):
                            img.putpixel((x, y), color)

            self.placeholder_frame = pil_to_bhwc(img)

    @model_loader
    async def load(self, **kwargs: dict) -> None:
        """Initialize processor state - called during model loading phase."""
        try:
            self.cfg.prompt_guidance_doc = self.load_prompt_guide("flux2_prompting.md")

            repo_id = os.environ.get("FLUX2_REPO_ID", "black-forest-labs/FLUX.2-dev")
            flux_model_download = snapshot_download(
                repo_id=repo_id,
                ignore_patterns=["flux2-dev.safetensors", "ae.safetensors"]
            )
            logger.info(f"Model files downloaded to {flux_model_download}")
            
            quantization_config = BitsAndBytesConfig(load_in_8bit=True)

            logger.info("Loading text encoder with 8-bit quantization")
            self.text_encoder = Mistral3ForConditionalGeneration.from_pretrained(
                repo_id, subfolder="text_encoder", dtype=torch.bfloat16, quantization_config=quantization_config,
                device_map="cuda"
            )
            self.text_tokenizer = MistralTokenizer.from_hf_hub("mistralai/Mistral-Small-3.2-24B-Instruct-2506")

            logger.info("Loading the Flux2 pipeline")
            self.pipe = Flux2Pipeline.from_pretrained(
				repo_id, text_encoder=None, torch_dtype=torch.bfloat16,
                                device_map="cuda"
			)
            self.pipe.text_encoder = self.text_encoder
            
            # Optimize pipeline for SPEED
            from torchao.quantization import quantize_, PerRow, Float8DynamicActivationFloat8WeightConfig
            quantize_(self.pipe.transformer, Float8DynamicActivationFloat8WeightConfig(granularity=PerRow()))

            if os.getenv("TORCH_COMPILE",""):
                #self.pipe.transformer.fuse_qkv_projections()   #does not work with torchao fp8
                self.pipe.transformer.to(memory_format=torch.channels_last)
                self.pipe.transformer = torch.compile(
                    self.pipe.transformer,
                    mode="default"
                )
                #self.pipe.vae.fuse_qkv_projections()
                #self.pipe.vae.to(memory_format=torch.channels_last)
                #self.pipe.vae.decode = torch.compile(
                #    self.pipe.vae.decode,
                #    mode="default"
                #)

            #run warmup
            self.pipe(prompt="a cat", height=self.cfg.height, width=self.cfg.width, guidance_scale=4, num_inference_steps=28)

            await self.create_placeholder_frame()

            # Set ready flag to open up worker
            gc.collect()
            torch.cuda.empty_cache()
            self.runner_ready = True
        except Exception as e:
            logger.error(f"Error loading model: {e}", exc_info=True)
            self.runner_ready = False
            raise

    @on_stream_start
    async def on_start(self, params) -> None:
        """Called when stream starts - initialize resources."""
        try:
            logger.info("Stream started, initializing resources")
            self.background_task_started = False
            # Check if runner is ready
            if not self.runner_ready:
                logger.error("Runner not ready - model may not be loaded yet")
                raise RuntimeError("Model not loaded - please wait for load() to complete")

            # Update params for pipeline
            await self.update_params(params)
            # Reset streaming state
            await self.create_placeholder_frame()
            self.current_frame = self.placeholder_frame
            # Initialize frame sender queue and task
            # Lock used to protect enqueuing of generated frames
            frame_sender_task = asyncio.create_task(self._send_frames())
            self.background_tasks.append(frame_sender_task)
            frame_generator = asyncio.create_task(self._generate_images_for_video())
            self.background_tasks.append(frame_generator)

            # Set frame_timestamp and increment
            self.frame_timestamp = 0
            self.timestamp_increment = self.time_base // self.fps
            # Runner is already initialized in load(), no need for server subprocess
            logger.info("Stream initialization complete - runner ready for inference")
        except Exception as e:
            logger.error(f"Error in on_start: {e}", exc_info=True)
            raise

    @on_stream_stop
    async def on_stop(self) -> None:
        """Called when stream stops - cleanup background tasks."""
        logger.info("Stream stopped, cleaning up background tasks")
        
        # Set interrupt flag to stop any running inference
        self.interrupt_requested = True
        logger.info("Set interrupt flag for running inference")
        
        # Wait for inference to complete if one is in progress
        if self.inference_in_progress:
            logger.info("Waiting for inference to complete...")
            # Wait up to 20 seconds for inference to finish
            try:
                await asyncio.wait_for(self.inference_completed_event.wait(), timeout=20.0)
                logger.info("Inference completed successfully")
            except asyncio.TimeoutError:
                logger.warning("Inference did not complete within 20 seconds, proceeding anyway")

        # Empty the frame_queue on stream stop
        lock = getattr(self, "frame_queue_lock", None)
        if lock is None:
            # If lock was never created, just drain the queue directly
            while not self.frame_queue.empty():
                try:
                    self.frame_queue.get_nowait()
                except Exception:
                    break
            logger.info("Emptied frame queue on stream stop (no lock present)")
        else:
            async with lock:
                while not self.frame_queue.empty():
                    try:
                        self.frame_queue.get_nowait()
                    except Exception:
                        break
                logger.info("Emptied frame queue on stream stop")
        
        # Cancel all background tasks including placeholder task
        for task in self.background_tasks:
            if not task.done():
                task.cancel()
                logger.info("Cancelled background task")
        
        self.background_tasks.clear()
        self.background_task_started = False
        
        # Cleanup runner
        gc.collect()
        torch.cuda.empty_cache()
        
        logger.info("All background tasks cleaned up")

    @video_handler
    async def handle_video(self, frame: VideoFrame) -> VideoFrame:
        """
        Process video frames - capture stream dimensions and pass through.
        Video generation happens in background based on start_image parameter.
        """               
        # Just return the original frame - generation happens in background
        # (add things here if want to do further processing - e.g. overlays, etc)
            
        return frame

    async def _generate_images_for_video(self) -> None:
        """
        Background task to generate video from image and enqueue frames for streaming.
        This runs continuously, generating new videos from the last frame.
        Video generation runs in a separate thread to avoid blocking frame sending.
        """
        while True:
            if self.processor.server.current_client.stop_event.is_set():
                break
            try:
                gen_start = time.perf_counter()
                
                # Reset interrupt flag for new inference
                self.interrupt_requested = False
                
                # Acquire inference lock to ensure only one inference runs at a time
                async with self.inference_lock:
                    # Move PyTorch inference to background thread to avoid blocking asyncio loop
                    image = await asyncio.to_thread(self._run_inference_with_callback)
                    
                    # update seed based on adjustment strategy
                    if self.cfg.seed_adjustment == "increment":
                        self.cfg.seed += 1
                    elif self.cfg.seed_adjustment == "decrement":
                        self.cfg.seed -= 1
                    elif self.cfg.seed_adjustment == "random":
                        self.cfg.seed = random.randint(0, 2**32 - 1)

                    gen_end = time.perf_counter()
                    logger.info(f"Image generation took {gen_end - gen_start:.2f} seconds")

                    # Update current frame in a thread-safe manner
                    self.current_frame = pil_to_bhwc(image)

            except Exception as e:
                logger.error(f"Error in image generation: {e}", exc_info=True)
                await asyncio.sleep(1.0)
            
            await asyncio.sleep(0.1)

    def _create_interrupt_callback(self):
        """
        Create a callback function that can interrupt inference during generation.
        This callback is called at each step of the diffusion process.
        """
        def interrupt_callback(pipeline, i, t, callback_kwargs):
            # Check if interrupt was requested
            if self.interrupt_requested:
                logger.info(f"Interrupting inference at step {i}/{t}")
                # Set an interrupt flag on the pipeline
                pipeline._interrupt = True
            return callback_kwargs
        
        return interrupt_callback
    
    def _run_inference_with_callback(self) -> Image.Image:
        """
        Synchronous function that runs PyTorch inference with callback-based interruption.
        This contains the actual model inference that was blocking the event loop.
        """
        # Track inference state
        self.inference_in_progress = True
        self.inference_count += 1
        logger.info(f"Starting inference #{self.inference_count} - in_progress: {self.inference_in_progress}")
        cfg = copy.deepcopy(self.cfg)   #snapshot for inference run
        # Clear completion event for new inference
        self.inference_completed_event.clear()
        
        try:
            # Create interrupt callback
            interrupt_callback = self._create_interrupt_callback()
            prompt = cfg.prompt
            if cfg.enhance_prompt:
                logger.info(f"Enhancing prompt for inference #{self.inference_count}")
                prompt = self.enhance_prompt(cfg.prompt)
                logger.info(f"Enhanced prompt: {prompt}")
            # Run inference with callback for interruption
            result = self.pipe(
                generator=torch.Generator(device="cuda").manual_seed(cfg.seed),
                image=cfg.processed_reference_images,
                height=cfg.height,
                width=cfg.width,
                prompt=prompt,
                guidance_scale=cfg.guidance_scale,
                num_inference_steps=cfg.steps,
                callback_on_step_end=interrupt_callback
            ).images[0]
            
            logger.info(f"Completed inference #{self.inference_count} seed: {self.cfg.seed}")
            return result
        except Exception as e:
            if "interrupt" in str(e).lower() or hasattr(self.pipe, '_interrupt'):
                logger.info(f"Inference #{self.inference_count} was interrupted")
                raise RuntimeError("Inference was interrupted")
            else:
                logger.error(f"Inference #{self.inference_count} failed with error: {e}")
                raise
        finally:
            # Ensure inference state is reset and signal completion
            self.inference_in_progress = False
            self.inference_completed_event.set()
            logger.info(f"Inference #{self.inference_count} completed - in_progress: {self.inference_in_progress}")

    async def _send_frames(self):
        """
        Background task to send frames from the queue in parallel to inference.
        """
        logger.info("Frame sender task started")
        try:
            #create silent audio tensor for audio/video sync if needed
            # default audio stream setup is 2 channel, 48kHz sample rate
            silent_audio_tensor = torch.zeros((2, int(48000 * (1.0 / self.fps))), dtype=torch.float)

            while True:
                # Check for task cancellation at the start of each iteration
                if asyncio.current_task() and asyncio.current_task().cancelled():
                    logger.info("Frame sender task cancelled - exiting loop")
                    raise asyncio.CancelledError("Task cancelled")
                
                # Check if stream should stop
                if self.processor and self.processor.server.current_client.stop_event.is_set():
                    logger.info("Frame sender task stopping due to stream stop event")
                    break
                
                #set frame and increment timestamp
                video_frame = VideoFrame(tensor=self.current_frame, timestamp=self.frame_timestamp, time_base=self.time_base_frac)
                self.frame_timestamp += self.timestamp_increment

                if not self.processor is None:
                    await self.processor.send_input_frame(video_frame)
                    #logger.info(f"Sent {video_frame.__class__.__name__} frame with timestamp {video_frame.timestamp}")
                    if self.no_audio_in_stream:
                        #send silent audio frame to keep audio/video sync
                        await self.processor.send_input_frame(
                            AudioFrame.from_tensor(
                                tensor=silent_audio_tensor,
                                timestamp=video_frame.timestamp,
                                time_base=self.time_base_frac,
                                format="fltp",
                                layout="stereo"
                            )
                        )
                    
                    # Sleep to maintain target FPS with cancellation check
                    sleep_duration = 1.0 * ((self.timestamp_increment-10) / 90000)
                    try:
                        await asyncio.sleep(sleep_duration)
                    except asyncio.CancelledError:
                        logger.info("Frame sender task cancelled during sleep")
                        raise
        except asyncio.CancelledError:
            logger.info("Frame sender task cancelled")
            raise
    
    @param_updater
    async def update_params(self, params: dict) -> None:
        """
        Update configuration parameters dynamically.
        When start_image is received, initiate the video generation pipeline.
        """

        #handle if params sent in key
        if "params" in params:
            params = params["params"]

        self.cfg.height = int(params.get("height", self.cfg.height))
        self.cfg.width = int(params.get("width", self.cfg.width))
        self.cfg.prompt = params.get("prompt", self.cfg.prompt)
        self.cfg.steps = int(params.get("steps", self.cfg.steps))
        self.cfg.guidance_scale = float(params.get("guidance_scale", self.cfg.guidance_scale))
        self.cfg.seed = int(params.get("seed", self.cfg.seed))
        self.cfg.seed_adjustment = params.get("seed_adjustment", self.cfg.seed_adjustment)
        self.cfg.enhance_prompt = params.get("enhance_prompt", "no").lower() in ("yes", "true", "1", "y", "on")
        self.cfg.enhance_guidance = params.get("enhance_guidance", self.cfg.enhance_guidance)
        # Reset processed reference images on param update
        self.cfg.processed_reference_images = None  

async def main() -> None:
    """Main entry point - creates and runs the stream processor."""
    try:
        from pytrickle.frame_overlay import OverlayConfig, OverlayMode
        
        handlers = InfiniteFlux2StreamHandlers()
        processor = StreamProcessor.from_handlers(
            handlers,
            name="inifinite-flux-2-worker",
            port=8000
        )
                
        # Store processor reference for background tasks
        handlers.processor = processor
                
        # Now start the server
        await processor.run_forever()
        
    except Exception as e:
        logger.error(f"Fatal error in main: {e}", exc_info=True)
        raise

if __name__ == "__main__":
    asyncio.run(main())
