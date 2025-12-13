import React, { useState, useEffect } from 'react';
import { Plus, Minus, Play, Square, Eye, Settings2, ChevronDown, ChevronUp, CheckCircle, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import { useWallet } from './WalletConnect';
import { API_BASE } from '../utils/apiConfig';
import { Toast, ToastContainer } from './Toast';

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
    rtmp_url: '',
    iframe_html: ''
  });
  
  // Dynamic parameters
  const [dynamicParams, setDynamicParams] = useState([
    { key: 'capability_name', value: 'image-generation' },
    { key: 'prompt', value: 'abstract watercolor sunset' },
    { key: 'seed', value: '42' },
    { key: 'steps', value: '28' },
    { key: 'guidance_scale', value: '4.0' }
  ]);
  
  // Stream status
  const [streamStatus, setStreamStatus] = useState('stopped');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [savedStreamId, setSavedStreamId] = useState(null);
  const [streamAlive, setStreamAlive] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  
  // Manual stream recovery
  const [manualStreamId, setManualStreamId] = useState('');
  const [recoveringStream, setRecoveringStream] = useState(false);

  // Notification state
  const [notification, setNotification] = useState(null);

  // Show notification helper
  const showNotification = (message, type = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

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

  // Check stream status from saved streamId
  const checkStreamStatus = async (streamId = savedStreamId) => {
    if (!streamId) {
      console.log('[AdminPanel] No streamId to check status for');
      return;
    }

    setCheckingStatus(true);
    console.log('[AdminPanel] Checking stream status for streamId:', streamId);

    try {
      // Call stream-server endpoint instead of gateway directly
      const response = await fetch(`${API_BASE}/api/stream/check-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ streamId })
      });

      console.log('[AdminPanel] Status response status:', response.status);

      if (response.ok) {
        const statusData = await response.json();
        console.log('[AdminPanel] Status response data:', statusData);
        
        // Check if stream is alive (has whep_url)
        const isAlive = statusData.alive;
        setStreamAlive(isAlive);
        
        if (isAlive) {
          setStreamStatus('running');
          setPreviewUrl(statusData.whep_url);
          setSavedStreamId(streamId); // Update saved streamId
          localStorage.setItem('streamId', streamId); // Save to localStorage
          
          // If settings are available, populate the form fields
          if (statusData.settings) {
            console.log('[AdminPanel] Populating form fields with saved settings:', statusData.settings);
            
            // Update required fields
            setRequiredFields({
              height: statusData.settings.height || '1024',
              width: statusData.settings.width || '1024',
              rtmp_url: statusData.settings.rtmp_output || '',
              iframe_html: statusData.settings.iframe_html || ''
            });
            
            // Update dynamic parameters
            if (statusData.settings.dynamicParams) {
              const dynamicParamsArray = Object.entries(statusData.settings.dynamicParams).map(([key, value]) => ({
                key,
                value: String(value)
              }));
              setDynamicParams(dynamicParamsArray);
            }
          }
          
          console.log('[AdminPanel] Stream is alive, setting status to running');
        } else {
          setStreamStatus('stopped');
          setStreamAlive(false);
          console.log('[AdminPanel] Stream is not alive, setting status to stopped');
        }
      } else {
        console.log('[AdminPanel] Status check failed:', response.status);
        setStreamAlive(false);
        setStreamStatus('stopped');
      }
    } catch (error) {
      console.error('[AdminPanel] Failed to check stream status:', error);
      setStreamAlive(false);
      setStreamStatus('stopped');
    } finally {
      setCheckingStatus(false);
    }
  };

  // Recover stream by manually inputting streamId
  const handleRecoverStream = async () => {
    if (!manualStreamId.trim()) {
      showNotification('Please enter a streamId', 'warning');
      return;
    }

    setRecoveringStream(true);
    console.log('[AdminPanel] Recovering stream with streamId:', manualStreamId);

    try {
      // Check if the stream exists and is alive
      await checkStreamStatus(manualStreamId.trim());
      
      // If we got here, the stream check was successful
      setManualStreamId(''); // Clear the input field
      console.log('[AdminPanel] Stream recovery completed');
      showNotification('Stream recovered successfully', 'success');
    } catch (error) {
      console.error('[AdminPanel] Failed to recover stream:', error);
      showNotification('Failed to recover stream: ' + error.message, 'error');
    } finally {
      setRecoveringStream(false);
    }
  };

  // Load saved streamId from localStorage and check status when admin status is confirmed
  useEffect(() => {
    if (isAdmin) {
      const loadSavedStreamId = () => {
        const savedId = localStorage.getItem('streamId');
        if (savedId) {
          console.log('[AdminPanel] Found saved streamId:', savedId);
          setSavedStreamId(savedId);
          checkStreamStatus(savedId); // Pass streamId directly instead of relying on state
        } else {
          console.log('[AdminPanel] No saved streamId found');
        }
      };

      loadSavedStreamId();
    }
  }, [isAdmin]);

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
  const updateRtmpUrl = (value) => {
    setRequiredFields(prev => ({
      ...prev,
      rtmp_url: value
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
    
    if (!requiredFields.rtmp_url || !requiredFields.rtmp_url.trim()) {
      errors.push('RTMP URL is required');
    }
    
    return errors;
  };

  // Start stream
  const handleStartStream = async () => {
    const errors = validateRequiredFields();
    if (errors.length > 0) {
      showNotification('Please fix the following errors:\n' + errors.join('\n'), 'warning');
      return;
    }

    setLoading(true);
    
    try {
      // Build stream request
      const streamRequest = {
        // Required fields
        height: requiredFields.height,
        width: requiredFields.width,
        rtmp_output: requiredFields.rtmp_url.trim(),
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
        
        // Save streamId for future status checks
        if (result.stream_id) {
          localStorage.setItem('streamId', result.stream_id);
          setSavedStreamId(result.stream_id);
          console.log('[AdminPanel] Saved streamId:', result.stream_id);
        }
        
        setStreamAlive(true);
        onStreamUpdate?.(result);
        showNotification('Stream started successfully', 'success');
      } else {
        throw new Error(result.error || 'Failed to start stream');
      }
    } catch (error) {
      console.error('Failed to start stream:', error);
      showNotification('Failed to start stream: ' + error.message, 'error');
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
        setStreamAlive(false);
        
        // Clear saved streamId when stream is stopped
        localStorage.removeItem('streamId');
        setSavedStreamId(null);
        console.log('[AdminPanel] Cleared saved streamId');
        showNotification('Stream stopped successfully', 'success');
      } else {
        throw new Error('Failed to stop stream');
      }
    } catch (error) {
      console.error('Failed to stop stream:', error);
      showNotification('Failed to stop stream: ' + error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Update stream
  const handleUpdateStream = async () => {
    setLoading(true);
    
    try {
      // Build update request with current form values
      const updateData = {
        ...dynamicParams.reduce((obj, param) => {
          obj[param.key] = param.value;
          return obj;
        }, {})
      };

      const response = await fetch(`${API_BASE}/api/stream/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData)
      });
      
      if (response.ok) {
        console.log('[AdminPanel] Stream updated successfully');
        showNotification('Stream updated successfully!', 'success');
      } else {
        throw new Error('Failed to update stream');
      }
    } catch (error) {
      console.error('Failed to update stream:', error);
      showNotification('Failed to update stream: ' + error.message, 'error');
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
            
            {/* Notification Area */}
            {notification && (
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                width: '90%',
                maxWidth: '400px'
              }}>
                <div className="toast" style={{
                  position: 'relative',
                  transform: 'none',
                  margin: '0 auto'
                }}>
                  <div className="toast-content">
                    <div className={`toast-icon ${notification.type}`}>
                      {notification.type === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                      {notification.type === 'warning' && <AlertTriangle className="w-5 h-5 text-yellow-500" />}
                      {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                      {notification.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
                    </div>
                    <div className="toast-text">
                      <p>{notification.message}</p>
                    </div>
                    <button
                      onClick={() => setNotification(null)}
                      className="toast-close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
            
            <div className="admin-content">
              {/* Stream Status */}
              <div className="admin-section">
                <h3>Stream Status</h3>
                <div className="status-indicator">
                  <div className={`status-dot ${streamStatus === 'running' ? 'status-running' : 'status-stopped'}`}></div>
                  <span className="status-text">{streamStatus}</span>
                  {(streamStatus === 'running' || savedStreamId) && (
                    <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>
                      (ID: {savedStreamId || 'N/A'})
                    </span>
                  )}
                  {checkingStatus && <span style={{ marginLeft: '8px', fontSize: '12px', color: '#666' }}>(checking...)</span>}
                </div>
              </div>

              {/* Manual Stream Recovery */}
              <div className="admin-section">
                <h3>Recover Stream</h3>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                  Enter a streamId to recover a running stream from the gateway
                </p>
                
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '12px' }}>Stream ID</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="Enter streamId to recover"
                      value={manualStreamId}
                      onChange={(e) => setManualStreamId(e.target.value)}
                      style={{ fontSize: '14px' }}
                    />
                  </div>
                  <button
                    className="btn btn-secondary"
                    onClick={handleRecoverStream}
                    disabled={recoveringStream || !manualStreamId.trim()}
                    style={{ padding: '8px 16px', fontSize: '14px' }}
                  >
                    {recoveringStream ? 'Recovering...' : '🔄 Recover'}
                  </button>
                </div>
                
                {recoveringStream && (
                  <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                    Checking stream status...
                  </div>
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
                      disabled={streamStatus === 'running' && streamAlive}
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
                      disabled={streamStatus === 'running' && streamAlive}
                    />
                  </div>
                </div>
                
                <div className="form-group">
                  <label className="form-label">RTMP Output URL</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="rtmp://example.com/stream"
                    value={requiredFields.rtmp_url}
                    onChange={(e) => updateRtmpUrl(e.target.value)}
                  />
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
              <div className="admin-controls" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleStartStream}
                    disabled={loading || streamStatus === 'running' || (savedStreamId && streamAlive)}
                  >
                    <Play size={16} style={{ marginRight: '8px' }} />
                    {loading ? 'Starting...' : streamStatus === 'running' ? 'Stream Running' : 'Start Stream'}
                  </button>
                  
                  <button
                    className="btn btn-secondary"
                    onClick={handleUpdateStream}
                    disabled={(!streamAlive)}
                  >
                    <Settings2 size={16} style={{ marginRight: '8px' }} />
                    {loading ? 'Updating...' : 'Update Stream'}
                  </button>
                </div>
                
                <button
                  className="btn btn-danger"
                  onClick={handleStopStream}
                  disabled={loading || streamStatus === 'stopped' || (savedStreamId && !streamAlive)}
                >
                  <Square size={16} style={{ marginRight: '8px' }} />
                  {loading ? 'Stopping...' : savedStreamId && !streamAlive ? 'Stream Not Alive' : 'Stop Stream'}
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