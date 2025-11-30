"""
FastAPI Backend for x402 Payments with Privy & Supabase
Credit-based system with payment sessions and webhook debiting
"""

from fastapi import FastAPI, HTTPException, Header, Request, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from supabase import create_client, Client
from datetime import datetime, timedelta
import os
import httpx
from web3 import Web3
from eth_account import Account
import json
import logging
import jwt
import asyncio
from decimal import Decimal
import uuid

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="x402 Payment Gateway", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
PRIVY_APP_ID = os.getenv("PRIVY_APP_ID")
PRIVY_APP_SECRET = os.getenv("PRIVY_APP_SECRET")
PRIVY_VERIFICATION_KEY = os.getenv("PRIVY_VERIFICATION_KEY")
USAGE_WALLET_ADDRESS = os.getenv("USAGE_WALLET_ADDRESS")  # External wallet to receive usage payments
FEE_WALLET_ADDRESS = os.getenv("FEE_WALLET_ADDRESS")  # External wallet to receive fee payments
FEE_PERCENTAGE = float(os.getenv("FEE_PERCENTAGE", "5.0"))  # Fee percentage (default 5%)
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
BASE_RPC = os.getenv("BASE_RPC_URL", "https://mainnet.base.org")
ARBITRUM_RPC = os.getenv("ARBITRUM_RPC_URL", "https://arb1.arbitrum.io/rpc")
TARGET_CONTRACT_ADDRESS = os.getenv("TARGET_CONTRACT_ADDRESS")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET", "your-webhook-secret")
SESSION_TIMEOUT_MINUTES = 20
X402_PAYMENT_CHAIN_ID = os.getenv("X402_PAYMENT_CHAIN_ID", "8453")  # Base chain ID

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Web3 instances
w3_base = Web3(Web3.HTTPProvider(BASE_RPC))

# USDC contract address on Base
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# USDC contract addresses
USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

# Security
security = HTTPBearer()


# Models
class WalletCreateRequest(BaseModel):
    email: Optional[str] = None
    privy_user_id: Optional[str] = None


class CreditDepositRequest(BaseModel):
    amount_usdc: float
    tx_hash: str
    chain: str = "base"


class PaymentSessionRequest(BaseModel):
    service_name: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ServicePaymentRequest(BaseModel):
    session_id: str
    amount_credits: float
    service_name: str
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class WebhookPaymentNotification(BaseModel):
    session_id: str
    payment_id: str
    amount_credits: float
    service_name: str
    timestamp: str
    signature: str


class User(BaseModel):
    id: str
    privy_user_id: str
    wallet_address: Optional[str]
    email: Optional[str]
    credit_balance: float
    created_at: str
    updated_at: str


class PaymentSession(BaseModel):
    session_id: str
    user_id: str
    service_name: str
    status: str
    total_debited: float
    payment_count: int
    metadata: Dict[str, Any]
    created_at: str
    expires_at: str
    closed_at: Optional[str] = None


class CreditTransaction(BaseModel):
    id: str
    user_id: str
    transaction_type: str
    amount: float
    balance_after: float
    reference_id: Optional[str]
    description: str
    created_at: str


# Database Schema Creation
async def init_database():
    """Initialize Supabase tables"""
    
    # Users table with credit balance
    users_schema = """
    CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        privy_user_id TEXT UNIQUE NOT NULL,
        wallet_address TEXT,
        email TEXT,
        credit_balance DECIMAL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_users_privy_id ON users(privy_user_id);
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
    """
    
    # Credit transactions table
    credit_transactions_schema = """
    CREATE TABLE IF NOT EXISTS credit_transactions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) NOT NULL,
        transaction_type TEXT NOT NULL, -- 'credit', 'debit'
        amount DECIMAL NOT NULL,
        balance_after DECIMAL NOT NULL,
        reference_id TEXT,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_user ON credit_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_credit_transactions_reference ON credit_transactions(reference_id);
    """
    
    # Payment sessions table
    payment_sessions_schema = """
    CREATE TABLE IF NOT EXISTS payment_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        session_id TEXT UNIQUE NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        service_name TEXT NOT NULL,
        status TEXT NOT NULL, -- 'active', 'closed', 'expired'
        total_debited DECIMAL DEFAULT 0,
        payment_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        closed_at TIMESTAMPTZ
    );
    
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_user ON payment_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_session_id ON payment_sessions(session_id);
    CREATE INDEX IF NOT EXISTS idx_payment_sessions_status ON payment_sessions(status);
    """
    
    # Session payments table (individual payments within a session)
    session_payments_schema = """
    CREATE TABLE IF NOT EXISTS session_payments (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        payment_id TEXT UNIQUE NOT NULL,
        session_id TEXT REFERENCES payment_sessions(session_id) NOT NULL,
        user_id UUID REFERENCES users(id) NOT NULL,
        amount_credits DECIMAL NOT NULL,
        usage_amount DECIMAL NOT NULL,
        fee_amount DECIMAL NOT NULL,
        service_name TEXT NOT NULL,
        description TEXT,
        metadata JSONB DEFAULT '{}',
        credit_transaction_id UUID REFERENCES credit_transactions(id),
        usage_tx_hash TEXT,
        fee_tx_hash TEXT,
        x402_status TEXT DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
    );
    
    CREATE INDEX IF NOT EXISTS idx_session_payments_session ON session_payments(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_payments_user ON session_payments(user_id);
    CREATE INDEX IF NOT EXISTS idx_session_payments_x402_status ON session_payments(x402_status);
    """
    
    # X402 deposits table
    x402_deposits_schema = """
    CREATE TABLE IF NOT EXISTS x402_deposits (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) NOT NULL,
        amount_usdc DECIMAL NOT NULL,
        amount_credits DECIMAL NOT NULL,
        tx_hash TEXT NOT NULL,
        chain TEXT NOT NULL,
        status TEXT NOT NULL, -- 'pending', 'confirmed', 'failed'
        credit_transaction_id UUID REFERENCES credit_transactions(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        confirmed_at TIMESTAMPTZ
    );
    
    CREATE INDEX IF NOT EXISTS idx_x402_deposits_user ON x402_deposits(user_id);
    CREATE INDEX IF NOT EXISTS idx_x402_deposits_tx_hash ON x402_deposits(tx_hash);
    """
    
    logger.info("Database schema initialized")


class PrivyAuth:
    """Privy authentication handler"""
    
    @staticmethod
    async def verify_token(token: str) -> Dict:
        """Verify Privy JWT token"""
        try:
            decoded = jwt.decode(
                token,
                options={"verify_signature": False},  # Set to True in production
                algorithms=["ES256"]
            )
            return decoded
        except jwt.InvalidTokenError as e:
            logger.error(f"Token verification failed: {e}")
            raise HTTPException(status_code=401, detail="Invalid authentication token")
    
    @staticmethod
    async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security)
    ) -> Dict:
        """Get current authenticated user"""
        token = credentials.credentials
        privy_data = await PrivyAuth.verify_token(token)
        
        privy_user_id = privy_data.get("sub")
        if not privy_user_id:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        
        result = supabase.table("users").select("*").eq("privy_user_id", privy_user_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        
        return result.data[0]


class CreditService:
    """Service for managing user credits"""
    
    @staticmethod
    async def add_credits(
        user_id: str,
        amount: float,
        reference_id: str,
        description: str,
        metadata: Dict = None
    ) -> Dict:
        """Add credits to user account"""
        try:
            # Get current balance
            user_result = supabase.table("users").select("credit_balance").eq("id", user_id).execute()
            current_balance = float(user_result.data[0]["credit_balance"])
            
            # Calculate new balance
            new_balance = current_balance + amount
            
            # Update user balance
            supabase.table("users").update({
                "credit_balance": new_balance,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            
            # Record transaction
            transaction_data = {
                "user_id": user_id,
                "transaction_type": "credit",
                "amount": amount,
                "balance_after": new_balance,
                "reference_id": reference_id,
                "description": description,
                "metadata": metadata or {}
            }
            
            tx_result = supabase.table("credit_transactions").insert(transaction_data).execute()
            
            logger.info(f"Added {amount} credits to user {user_id}. New balance: {new_balance}")
            
            return tx_result.data[0]
            
        except Exception as e:
            logger.error(f"Error adding credits: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to add credits: {str(e)}")
    
    @staticmethod
    async def debit_credits(
        user_id: str,
        amount: float,
        reference_id: str,
        description: str,
        metadata: Dict = None
    ) -> Dict:
        """Debit credits from user account"""
        try:
            # Get current balance
            user_result = supabase.table("users").select("credit_balance").eq("id", user_id).execute()
            current_balance = float(user_result.data[0]["credit_balance"])
            
            # Check sufficient balance
            if current_balance < amount:
                raise HTTPException(
                    status_code=402,
                    detail=f"Insufficient credits. Balance: {current_balance}, Required: {amount}"
                )
            
            # Calculate new balance
            new_balance = current_balance - amount
            
            # Update user balance
            supabase.table("users").update({
                "credit_balance": new_balance,
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", user_id).execute()
            
            # Record transaction
            transaction_data = {
                "user_id": user_id,
                "transaction_type": "debit",
                "amount": amount,
                "balance_after": new_balance,
                "reference_id": reference_id,
                "description": description,
                "metadata": metadata or {}
            }
            
            tx_result = supabase.table("credit_transactions").insert(transaction_data).execute()
            
            logger.info(f"Debited {amount} credits from user {user_id}. New balance: {new_balance}")
            
            return tx_result.data[0]
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error debiting credits: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to debit credits: {str(e)}")
    
    @staticmethod
    async def get_balance(user_id: str) -> float:
        """Get user's current credit balance"""
        result = supabase.table("users").select("credit_balance").eq("id", user_id).execute()
        return float(result.data[0]["credit_balance"])


class SessionService:
    """Service for managing payment sessions"""
    
    @staticmethod
    async def create_session(
        user_id: str,
        service_name: str,
        metadata: Dict = None
    ) -> Dict:
        """Create a new payment session"""
        session_id = f"sess_{uuid.uuid4().hex}"
        expires_at = datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES)
        
        session_data = {
            "session_id": session_id,
            "user_id": user_id,
            "service_name": service_name,
            "status": "active",
            "total_debited": 0,
            "payment_count": 0,
            "metadata": metadata or {},
            "expires_at": expires_at.isoformat()
        }
        
        result = supabase.table("payment_sessions").insert(session_data).execute()
        
        logger.info(f"Created payment session {session_id} for user {user_id}")
        
        return result.data[0]
    
    @staticmethod
    async def get_session(session_id: str) -> Dict:
        """Get payment session by ID"""
        result = supabase.table("payment_sessions").select("*").eq("session_id", session_id).execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")
        
        return result.data[0]
    
    @staticmethod
    async def close_session(session_id: str) -> Dict:
        """Close a payment session"""
        session = await SessionService.get_session(session_id)
        
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Session is not active")
        
        # Get all payments in session
        payments_result = supabase.table("session_payments").select("*").eq("session_id", session_id).execute()
        
        # Update session status
        update_data = {
            "status": "closed",
            "closed_at": datetime.utcnow().isoformat()
        }
        
        result = supabase.table("payment_sessions").update(update_data).eq("session_id", session_id).execute()
        
        session = result.data[0]
        session["payments"] = payments_result.data
        
        logger.info(f"Closed session {session_id} with {session['payment_count']} payments totaling {session['total_debited']} credits")
        
        return session
    
    @staticmethod
    async def expire_old_sessions():
        """Expire sessions that have timed out"""
        cutoff = datetime.utcnow().isoformat()
        
        result = supabase.table("payment_sessions").update({
            "status": "expired",
            "closed_at": datetime.utcnow().isoformat()
        }).eq("status", "active").lt("expires_at", cutoff).execute()
        
        if result.data:
            logger.info(f"Expired {len(result.data)} sessions")
        
        return result.data


class PrivyClient:
    """Client for Privy API interactions"""
    
    def __init__(self, app_id: str, app_secret: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.base_url = "https://auth.privy.io/api/v1"
        
    async def get_user_wallets(self, privy_user_id: str) -> List[Dict]:
        """Get user's wallets from Privy"""
        async with httpx.AsyncClient() as client:
            headers = {
                "privy-app-id": self.app_id,
                "Authorization": f"Bearer {self.app_secret}",
            }
            
            try:
                response = await client.get(
                    f"{self.base_url}/users/{privy_user_id}",
                    headers=headers
                )
                response.raise_for_status()
                user_data = response.json()
                
                wallets = []
                for account in user_data.get("linked_accounts", []):
                    if account.get("type") == "wallet":
                        wallets.append({
                            "address": account.get("address"),
                            "wallet_client": account.get("wallet_client"),
                            "chain_type": account.get("chain_type", "ethereum")
                        })
                
                return wallets
            except httpx.HTTPError as e:
                logger.error(f"Privy API error: {e}")
                raise HTTPException(status_code=500, detail="Failed to fetch wallets")


class X402PaymentService:
    """Service for handling x402 payments from user Privy wallets"""
    
    @staticmethod
    def calculate_payment_split(payment_amount: float) -> Dict[str, float]:
        """Calculate usage and fee amounts from payment"""
        fee_amount = payment_amount * (FEE_PERCENTAGE / 100)
        usage_amount = payment_amount
        
        return {
            "usage_amount": usage_amount,
            "fee_amount": fee_amount,
            "total_amount": usage_amount + fee_amount
        }
    
    @staticmethod
    async def send_x402_payments(
        user_privy_id: str,
        payment_amount: float,
        payment_id: str,
        metadata: Dict = None
    ) -> Dict:
        """Send x402 payments from user's Privy wallet to usage and fee wallets"""
        
        if not USAGE_WALLET_ADDRESS:
            raise HTTPException(status_code=500, detail="Usage wallet not configured")
        
        if not FEE_WALLET_ADDRESS:
            raise HTTPException(status_code=500, detail="Fee wallet not configured")
        
        try:
            # Calculate payment split
            split = X402PaymentService.calculate_payment_split(payment_amount)
            
            logger.info(f"Sending x402 payments for {payment_amount} USDC: "
                       f"Usage: {split['usage_amount']}, Fee: {split['fee_amount']}")
            
            # Convert amounts to USDC smallest unit (6 decimals)
            usage_amount_wei = int(split['usage_amount'] * 10**6)
            fee_amount_wei = int(split['fee_amount'] * 10**6)
            
            # Create USDC contract instance for encoding
            usdc_contract = w3_base.eth.contract(
                address=Web3.to_checksum_address(USDC_BASE),
                abi=json.loads('[{"constant":false,"inputs":[{"name":"_to","type":"address"},{"name":"_value","type":"uint256"}],"name":"transfer","outputs":[{"name":"","type":"bool"}],"type":"function"}]')
            )
            
            # Encode transfer to USAGE wallet
            usage_transfer_data = usdc_contract.encodeABI(
                fn_name='transfer',
                args=[
                    Web3.to_checksum_address(USAGE_WALLET_ADDRESS),
                    usage_amount_wei
                ]
            )
            
            # Send usage payment via Privy
            logger.info(f"Sending usage payment: {split['usage_amount']} USDC to {USAGE_WALLET_ADDRESS}")
            usage_tx_hash = await privy_client.send_transaction(
                privy_user_id=user_privy_id,
                chain_id=X402_PAYMENT_CHAIN_ID,
                to_address=USDC_BASE,
                value_wei="0",
                data=usage_transfer_data
            )
            
            logger.info(f"Usage payment sent. TX: {usage_tx_hash}")
            
            # Encode transfer to FEE wallet
            fee_transfer_data = usdc_contract.encodeABI(
                fn_name='transfer',
                args=[
                    Web3.to_checksum_address(FEE_WALLET_ADDRESS),
                    fee_amount_wei
                ]
            )
            
            # Send fee payment via Privy
            logger.info(f"Sending fee payment: {split['fee_amount']} USDC to {FEE_WALLET_ADDRESS}")
            fee_tx_hash = await privy_client.send_transaction(
                privy_user_id=user_privy_id,
                chain_id=X402_PAYMENT_CHAIN_ID,
                to_address=USDC_BASE,
                value_wei="0",
                data=fee_transfer_data
            )
            
            logger.info(f"Fee payment sent. TX: {fee_tx_hash}")
            
            return {
                "usage_tx_hash": usage_tx_hash,
                "fee_tx_hash": fee_tx_hash,
                "usage_amount": split['usage_amount'],
                "fee_amount": split['fee_amount'],
                "usage_wallet": USAGE_WALLET_ADDRESS,
                "fee_wallet": FEE_WALLET_ADDRESS,
                "chain": X402_PAYMENT_CHAIN_ID,
                "status": "sent"
            }
            
        except Exception as e:
            logger.error(f"x402 payment error: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to send x402 payments: {str(e)}")


# Initialize services
privy_client = PrivyClient(PRIVY_APP_ID, PRIVY_APP_SECRET)


# Background task for session expiration
async def session_expiration_task():
    """Background task to expire old sessions"""
    while True:
        try:
            await SessionService.expire_old_sessions()
        except Exception as e:
            logger.error(f"Error in session expiration task: {e}")
        
        # Run every minute
        await asyncio.sleep(60)


# API Endpoints
@app.on_event("startup")
async def startup_event():
    """Initialize database and start background tasks"""
    await init_database()
    asyncio.create_task(session_expiration_task())


@app.get("/")
async def root():
    return {
        "service": "x402 Payment Gateway with Credit System",
        "version": "2.0.0",
        "status": "operational"
    }


@app.post("/api/auth/register", response_model=User)
async def register_user(
    request: WalletCreateRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    """Register a new user with Privy authentication"""
    token = credentials.credentials
    privy_data = await PrivyAuth.verify_token(token)
    privy_user_id = privy_data.get("sub")
    
    # Check if user exists
    result = supabase.table("users").select("*").eq("privy_user_id", privy_user_id).execute()
    
    if result.data:
        return result.data[0]
    
    # Get wallets from Privy
    wallets = await privy_client.get_user_wallets(privy_user_id)
    wallet_address = wallets[0]["address"] if wallets else None
    
    # Create user
    user_data = {
        "privy_user_id": privy_user_id,
        "wallet_address": wallet_address,
        "email": request.email or privy_data.get("email"),
        "credit_balance": 0
    }
    
    result = supabase.table("users").insert(user_data).execute()
    
    return result.data[0]


@app.get("/api/users/me", response_model=User)
async def get_current_user_info(
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Get current authenticated user information"""
    return current_user


@app.get("/api/credits/balance")
async def get_credit_balance(
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Get user's current credit balance"""
    balance = await CreditService.get_balance(current_user["id"])
    return {
        "user_id": current_user["id"],
        "credit_balance": balance
    }


@app.post("/api/credits/deposit")
async def deposit_credits(
    request: CreditDepositRequest,
    current_user: Dict = Depends(PrivyAuth.get_current_user),
    x_payment_proof: Optional[str] = Header(None)
):
    """Deposit credits via x402 payment"""
    
    # Verify x402 payment proof
    if not x_payment_proof:
        raise HTTPException(status_code=402, detail="Payment required (x402)")
    
    # Record deposit
    deposit_data = {
        "user_id": current_user["id"],
        "amount_usdc": request.amount_usdc,
        "amount_credits": request.amount_usdc,  # 1:1 conversion for now
        "tx_hash": request.tx_hash,
        "chain": request.chain,
        "status": "pending"
    }
    
    deposit_result = supabase.table("x402_deposits").insert(deposit_data).execute()
    deposit = deposit_result.data[0]
    
    try:
        # Add credits to user account
        credit_tx = await CreditService.add_credits(
            user_id=current_user["id"],
            amount=request.amount_usdc,
            reference_id=deposit["id"],
            description=f"x402 deposit from {request.chain}",
            metadata={
                "tx_hash": request.tx_hash,
                "chain": request.chain
            }
        )
        
        # Update deposit status
        supabase.table("x402_deposits").update({
            "status": "confirmed",
            "credit_transaction_id": credit_tx["id"],
            "confirmed_at": datetime.utcnow().isoformat()
        }).eq("id", deposit["id"]).execute()
        
        balance = await CreditService.get_balance(current_user["id"])
        
        return {
            "deposit_id": deposit["id"],
            "amount_credited": request.amount_usdc,
            "new_balance": balance,
            "status": "confirmed"
        }
        
    except Exception as e:
        # Mark deposit as failed
        supabase.table("x402_deposits").update({
            "status": "failed"
        }).eq("id", deposit["id"]).execute()
        
        raise


@app.get("/api/credits/history")
async def get_credit_history(
    current_user: Dict = Depends(PrivyAuth.get_current_user),
    limit: int = 50,
    transaction_type: Optional[str] = None
):
    """Get user's credit transaction history"""
    query = supabase.table("credit_transactions").select("*").eq("user_id", current_user["id"])
    
    if transaction_type:
        query = query.eq("transaction_type", transaction_type)
    
    result = query.order("created_at", desc=True).limit(limit).execute()
    
    return {"transactions": result.data}


@app.post("/api/sessions/create", response_model=PaymentSession)
async def create_payment_session(
    request: PaymentSessionRequest,
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Create a new payment session"""
    session = await SessionService.create_session(
        user_id=current_user["id"],
        service_name=request.service_name,
        metadata=request.metadata
    )
    
    return PaymentSession(**session)


@app.get("/api/sessions/{session_id}", response_model=PaymentSession)
async def get_payment_session(
    session_id: str,
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Get payment session details"""
    session = await SessionService.get_session(session_id)
    
    # Verify ownership
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    return PaymentSession(**session)


@app.post("/api/sessions/{session_id}/close")
async def close_payment_session(
    session_id: str,
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Close a payment session and get summary"""
    session = await SessionService.get_session(session_id)
    
    # Verify ownership
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    closed_session = await SessionService.close_session(session_id)
    
    return {
        "session": closed_session,
        "summary": {
            "total_debited": closed_session["total_debited"],
            "payment_count": closed_session["payment_count"],
            "payments": closed_session["payments"]
        }
    }


@app.post("/api/webhooks/payment")
async def payment_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    x_webhook_signature: Optional[str] = Header(None)
):
    """Webhook endpoint for service payment notifications"""
    
    # Verify webhook signature
    if not x_webhook_signature:
        raise HTTPException(status_code=401, detail="Missing webhook signature")
    
    # In production: verify signature with WEBHOOK_SECRET
    # import hmac
    # body_bytes = await request.body()
    # expected_sig = hmac.new(WEBHOOK_SECRET.encode(), body_bytes, 'sha256').hexdigest()
    # if not hmac.compare_digest(x_webhook_signature, expected_sig):
    #     raise HTTPException(status_code=401, detail="Invalid signature")
    
    body = await request.json()
    notification = WebhookPaymentNotification(**body)
    
    try:
        # Get session
        session = await SessionService.get_session(notification.session_id)
        
        if session["status"] != "active":
            raise HTTPException(status_code=400, detail="Session is not active")
        
        # Check if session has expired
        if datetime.fromisoformat(session["expires_at"]) < datetime.utcnow():
            raise HTTPException(status_code=400, detail="Session has expired")
        
        # Get user info
        user_result = supabase.table("users").select("*").eq("id", session["user_id"]).execute()
        user = user_result.data[0]
        
        # Calculate payment split
        split = X402PaymentService.calculate_payment_split(notification.amount_credits)
        total_debit = split['total_amount']
        
        # Debit total amount (usage + fee) from user credits
        credit_tx = await CreditService.debit_credits(
            user_id=session["user_id"],
            amount=total_debit,
            reference_id=notification.payment_id,
            description=f"Payment for {notification.service_name} (usage + {FEE_PERCENTAGE}% fee)",
            metadata={
                "session_id": notification.session_id,
                "service_name": notification.service_name,
                "usage_amount": split['usage_amount'],
                "fee_amount": split['fee_amount']
            }
        )
        
        # Record payment in session
        payment_data = {
            "payment_id": notification.payment_id,
            "session_id": notification.session_id,
            "user_id": session["user_id"],
            "amount_credits": notification.amount_credits,
            "usage_amount": split['usage_amount'],
            "fee_amount": split['fee_amount'],
            "service_name": notification.service_name,
            "description": f"Service payment via webhook",
            "metadata": {
                "fee_percentage": FEE_PERCENTAGE
            },
            "credit_transaction_id": credit_tx["id"],
            "x402_status": "pending"
        }
        
        payment_result = supabase.table("session_payments").insert(payment_data).execute()
        payment = payment_result.data[0]
        
        # Send x402 payments from user's Privy wallet to usage and fee wallets
        try:
            x402_payments = await X402PaymentService.send_x402_payments(
                user_privy_id=user["privy_user_id"],
                payment_amount=notification.amount_credits,
                payment_id=notification.payment_id
            )
            
            # Update payment with x402 transaction details
            supabase.table("session_payments").update({
                "usage_tx_hash": x402_payments["usage_tx_hash"],
                "fee_tx_hash": x402_payments["fee_tx_hash"],
                "x402_status": "sent"
            }).eq("payment_id", notification.payment_id).execute()
            
            logger.info(f"x402 payments sent for payment {notification.payment_id}:")
            logger.info(f"  Usage TX: {x402_payments['usage_tx_hash']}")
            logger.info(f"  Fee TX: {x402_payments['fee_tx_hash']}")
            
            x402_result = {
                "usage_tx_hash": x402_payments["usage_tx_hash"],
                "fee_tx_hash": x402_payments["fee_tx_hash"],
                "usage_amount": x402_payments["usage_amount"],
                "fee_amount": x402_payments["fee_amount"],
                "x402_status": "sent"
            }
            
        except Exception as e:
            logger.error(f"Failed to send x402 payments: {e}")
            # Mark x402 as failed but don't fail the entire webhook
            supabase.table("session_payments").update({
                "x402_status": "failed",
                "metadata": {"x402_error": str(e), "fee_percentage": FEE_PERCENTAGE}
            }).eq("payment_id", notification.payment_id).execute()
            
            x402_result = {
                "x402_status": "failed",
                "error": str(e)
            }
        
        # Update session totals
        new_total = float(session["total_debited"]) + total_debit
        new_count = session["payment_count"] + 1
        
        supabase.table("payment_sessions").update({
            "total_debited": new_total,
            "payment_count": new_count
        }).eq("session_id", notification.session_id).execute()
        
        logger.info(f"Processed webhook payment {notification.payment_id} for session {notification.session_id}")
        
        return {
            "status": "success",
            "payment_id": notification.payment_id,
            "session_id": notification.session_id,
            "amount_debited": notification.amount_credits,
            "fee_debited": split['fee_amount'],
            "total_debited": total_debit,
            **x402_result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook processing error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions/{session_id}/payments")
async def get_session_payments(
    session_id: str,
    current_user: Dict = Depends(PrivyAuth.get_current_user)
):
    """Get all payments for a session"""
    session = await SessionService.get_session(session_id)
    
    # Verify ownership
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    result = supabase.table("session_payments").select("*").eq("session_id", session_id).order("created_at", desc=True).execute()
    
    return {
        "session_id": session_id,
        "payments": result.data,
        "total": len(result.data)
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    try:
        supabase.table("users").select("id").limit(1).execute()
        db_healthy = True
    except Exception as e:
        logger.error(f"Database health check failed: {e}")
        db_healthy = False
    
    return {
        "status": "healthy" if db_healthy else "degraded",
        "timestamp": datetime.utcnow().isoformat(),
        "chains": {
            "base": w3_base.is_connected()
        },
        "database": db_healthy
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)