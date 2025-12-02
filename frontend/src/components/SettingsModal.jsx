import React from 'react'
import { X, Upload } from 'lucide-react'

const SettingsModal = ({ isOpen, onClose, settings, onSettingsChange, onImageUpload, onApply }) => {
  if (!isOpen) return null

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    const imagePromises = files.slice(0, 10).map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = (event) => {
          resolve(`data:${file.type};base64,${btoa(event.target.result)}`)
        }
        reader.readAsDataURL(file)
      })
    })

    Promise.all(imagePromises).then(images => {
      onSettingsChange(prev => ({
        ...prev,
        reference_images: images
      }))
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Stream Settings</h2>
          <button 
            className="close-btn"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Prompt</label>
            <textarea
              value={settings.prompt}
              onChange={(e) => onSettingsChange(prev => ({
                ...prev,
                prompt: e.target.value
              }))}
              className="input"
              rows="3"
              placeholder="Describe your stream content..."
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Steps</label>
              <input
                type="number"
                value={settings.steps}
                onChange={(e) => onSettingsChange(prev => ({
                  ...prev,
                  steps: parseInt(e.target.value) || 28
                }))}
                className="input"
                min="1"
                max="100"
              />
            </div>
            
            <div className="form-group">
              <label>Guidance Scale</label>
              <input
                type="number"
                step="0.1"
                value={settings.guidance_scale}
                onChange={(e) => onSettingsChange(prev => ({
                  ...prev,
                  guidance_scale: parseFloat(e.target.value) || 4.0
                }))}
                className="input"
                min="0.1"
                max="20"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label>Reference Images (up to 10)</label>
            <div className="file-upload">
              <input
                type="file"
                multiple
                accept="image/*"
                onChange={handleImageUpload}
                className="file-input"
              />
              <div className="file-upload-btn">
                <Upload size={16} />
                Upload Images
              </div>
            </div>
            {settings.reference_images.length > 0 && (
              <div className="image-preview">
                {settings.reference_images.map((img, index) => (
                  <img 
                    key={index}
                    src={img} 
                    alt={`Reference ${index + 1}`}
                    className="preview-image"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button 
            className="btn btn-primary"
            onClick={onApply}
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  )
}

export default SettingsModal