import React, { useState, useEffect } from 'react';
import { Plus, Minus, Play, Square, Eye, Settings2, ChevronDown, ChevronUp } from 'lucide-react';
import { useWallet } from './WalletConnect';
import { API_BASE } from '../utils/apiConfig';

/**
 * Admin Panel Component
 * Provides broadcasting stream management for authorized wallets
 */
const AdminPanel = ({ isOpen, onStreamUpdate, onAdminButtonClick }) => {
  console.log('[AdminPanel] Component rendered/updated, isOpen:', isOpen);
  
  const { address, isConnected, enhancedAuth } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Required fields
  const [requiredFields, setRequiredFields] = useState({
    height: '1024',
    width: '1024',
    rtmp_urls: ['', '', ''],
    iframe_html: ''
  });
  
  // Dynamic parameters
  const [dynamicParams, setDynamicParams] = useState([
    { key: 'capability_name', value: 'image-generation' },
    { key: 'prompt', value: 'A serene deep forest landscape at dawn, soft golden light filtering through towering ancient trees, dense moss-covered trunks, gentle mist drifting between the branches, scattered wildflowers along a narrow winding path, lush ferns covering the forest floor, calm atmosphere, cinematic composition with strong depth, ultra-detailed textures, natural color palette, subtle rays of light, tranquil and immersive mood.' },
    { key: 'seed', value: '42' },
    { key: 'steps', value: '28' },
    { key: 'guidance_scale', value: '4.5' }
  ]);
  
  // Stream status
  const [streamStatus, setStreamStatus] = useState('stopped');
  const [previewUrl, setPreviewUrl] = useState(null);

  // Check if user is admin (matches CREATOR_ADDRESS)
  // Only check after authentication is verified
  useEffect(() => {
    const checkAdminStatus = async () => {
      console.log('[AdminPanel] Checking admin status...', {
        isConnected,
        address,
        enhancedAuth,
        authenticated: enhancedAuth?.authenticated
      });
      
      // Only proceed if wallet is connected and authentication is verified
      if (!isConnected || !address || !enhancedAuth?.authenticated) {
        console.log('[AdminPanel] Skipping admin check - missing requirements:', {
          isConnected,
          address,
          authenticated: enhancedAuth?.authenticated
        });
        return;
      }
      
      console.log('[AdminPanel] Making admin check request for address:', address);
      
      try {
        const response = await fetch(`${API_BASE}/api/stream/admin/check`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address })
        });
        
        console.log('[AdminPanel] Admin check response status:', response.status);
        
        const data = await response.json();
        console.log('[AdminPanel] Admin check response data:', data);
        
        setIsAdmin(data.isAdmin);
        console.log('[AdminPanel] Set isAdmin to:', data.isAdmin);
      } catch (error) {
        console.error('[AdminPanel] Failed to check admin status:', error);
        setIsAdmin(false);
      }
    };
    
    checkAdminStatus();
  }, [address, isConnected, enhancedAuth?.authenticated]);

  // Toggle admin panel overlay
  const toggleAdminPanel = () => {
    console.log('[AdminPanel] Toggle button clicked, current isOpen:', isOpen);
    onAdminButtonClick?.(!isOpen);
  };

  // Update required field
  const updateRequiredField = (field, value) => {
    setRequiredFields(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Update RTMP URL
  const updateRtmpUrl = (index, value) => {
    setRequiredFields(prev => ({
      ...prev,
      rtmp_urls: prev.rtmp_urls.map((url, i) => i === index ? value : url)
    }));
  };

  // Update dynamic parameter
  const updateDynamicParam = (index, field, value) => {
    setDynamicParams(prev =>
      prev.map((param, i) => i === index ? { ...param, [field]: value } : param)
    );
  };

  // Add new dynamic parameter
  const addDynamicParam = () => {
    setDynamicParams(prev => [...prev, { key: '', value: '' }]);
  };

  // Remove dynamic parameter
  const removeDynamicParam = (index) => {
    setDynamicParams(prev => prev.filter((_, i) => i !== index));
  };

  // Validate required fields
  const validateRequiredFields = () => {
    const errors = [];
    
    if (!requiredFields.height || parseInt(requiredFields.height) <= 0) {
      errors.push('Height must be a positive number');
    }
    
    if (!requiredFields.width || parseInt(requiredFields.width) <= 0) {
      errors.push('Width must be a positive number');
    }
    
    const validRtmpUrls = requiredFields.rtmp_urls.filter(url => url.trim());
    if (validRtmpUrls.length === 0) {
      errors.push('At least one RTMP URL is required');
    }
    
    return errors;
  };

  // Start stream
  const handleStartStream = async () => {
    const errors = validateRequiredFields();
    if (errors.length > 0) {
      alert('Please fix the following errors:\n' + errors.join('\n'));
      return;
    }

    setLoading(true);
    
    try {
      // Build stream request
      const streamRequest = {
        // Required fields
        height: requiredFields.height,
        width: requiredFields.width,
        rtmp_output: requiredFields.rtmp_urls.filter(url => url.trim()).join(','),
        iframe_html: requiredFields.iframe_html,
        
        // Dynamic parameters
        ...dynamicParams.reduce((acc, param) => {
          if (param.key && param.value) {
            acc[param.key] = param.value;
          }
          return acc;
        }, {})
      };
      
      const response = await fetch(`${API_BASE}/api/stream/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamRequest)
      });
      
      const result = await response.json();
      
      if (response.ok) {
        setStreamStatus('running');
        setPreviewUrl(result.whep_url);
        onStreamUpdate?.(result);
      } else {
        throw new Error(result.error || 'Failed to start stream');
      }
    } catch (error) {
      console.error('Failed to start stream:', error);
      alert('Failed to start stream: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Stop stream
  const handleStopStream = async () => {
    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/stream/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        setStreamStatus('stopped');
        setPreviewUrl(null);
      } else {
        throw new Error('Failed to stop stream');
      }
    } catch (error) {
      console.error('Failed to stop stream:', error);
      alert('Failed to stop stream: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Open stream preview
  const handlePreviewStream = () => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  };

  // Only render admin panel when authenticated as admin
  console.log('[AdminPanel] Render check - isAdmin:', isAdmin, 'isOpen:', isOpen);
  
  if (!isAdmin) {
    console.log('[AdminPanel] Not rendering admin panel - user is not admin');
    return null;
  }
  
  console.log('[AdminPanel] Rendering admin modal - user is admin, isOpen:', isOpen);
  
  return (
    <>
      {/* Admin Panel Overlay */}
      {isOpen && (
        <div className="admin-overlay">
          <div className="admin-modal">
            <div className="admin-header">
              <h2>🎬 Stream Admin Panel</h2>
              <button
                className="control-btn glass"
                onClick={toggleAdminPanel}
                style={{ padding: '8px 12px', minWidth: 'auto' }}
              >
                <Settings2 size={16} />
              </button>
            </div>
            
            <div className="admin-content">
              {/* Stream Status */}
              <div className="admin-section">
                <h3>Stream Status</h3>
                <div className="status-indicator">
                  <div className={`status-dot ${streamStatus === 'running' ? 'status-running' : 'status-stopped'}`}></div>
                  <span className="status-text">{streamStatus}</span>
                </div>
                
                {previewUrl && (
                  <button
                    className="btn btn-secondary"
                    onClick={handlePreviewStream}
                    style={{ marginTop: '8px' }}
                  >
                    <Eye size={16} style={{ marginRight: '8px' }} />
                    Preview Stream
                  </button>
                )}
              </div>

              {/* Required Fields */}
              <div className="admin-section">
                <h3>Required Stream Configuration</h3>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Height</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="720"
                      value={requiredFields.height}
                      onChange={(e) => updateRequiredField('height', e.target.value)}
                    />
                  </div>
                  
                  <div className="form-group">
                    <label className="form-label">Width</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="1280"
                      value={requiredFields.width}
                      onChange={(e) => updateRequiredField('width', e.target.value)}
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">RTMP Output URLs</label>
                  <div className="rtmp-urls-container">
                    {requiredFields.rtmp_urls.map((url, index) => (
                      <input
                        key={index}
                        type="url"
                        className="input"
                        placeholder={`RTMP URL ${index + 1}`}
                        value={url}
                        onChange={(e) => updateRtmpUrl(index, e.target.value)}
                      />
                    ))}
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">Iframe HTML (Optional)</label>
                  <textarea
                    className="textarea"
                    placeholder="<iframe src='https://player.example.com/embed/stream' width='1280' height='720'></iframe>"
                    value={requiredFields.iframe_html}
                    onChange={(e) => updateRequiredField('iframe_html', e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              {/* Dynamic Parameters */}
              <div className="admin-section">
                <div className="admin-section-header">
                  <h3>Dynamic Parameters</h3>
                  <button
                    className="btn btn-secondary"
                    onClick={addDynamicParam}
                  >
                    <Plus size={16} style={{ marginRight: '8px' }} />
                    Add Parameter
                  </button>
                </div>
                
                <div className="params-container">
                  {dynamicParams.map((param, index) => (
                    <div key={index} className="param-row">
                      <input
                        className="input"
                        placeholder="Parameter name"
                        value={param.key}
                        onChange={(e) => updateDynamicParam(index, 'key', e.target.value)}
                      />
                      <input
                        className="input"
                        placeholder="Parameter value"
                        value={param.value}
                        onChange={(e) => updateDynamicParam(index, 'value', e.target.value)}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => removeDynamicParam(index)}
                        disabled={dynamicParams.length <= 1}
                      >
                        <Minus size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Control Buttons */}
              <div className="admin-controls">
                <button
                  className="btn btn-primary"
                  onClick={handleStartStream}
                  disabled={loading || streamStatus === 'running'}
                >
                  <Play size={16} style={{ marginRight: '8px' }} />
                  {loading ? 'Starting...' : 'Start Stream'}
                </button>
                
                <button
                  className="btn btn-danger"
                  onClick={handleStopStream}
                  disabled={loading || streamStatus === 'stopped'}
                >
                  <Square size={16} style={{ marginRight: '8px' }} />
                  {loading ? 'Stopping...' : 'Stop Stream'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminPanel;