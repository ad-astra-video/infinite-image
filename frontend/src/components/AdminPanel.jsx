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
    capability_name: 'image-generation',
    height: '1024',
    width: '1024',
    rtmp_url: '',
    stream_key: '',
    playback_url: '',
    iframe_html: ''
  });

  // Suggested resolutions
  const [selectedResolution, setSelectedResolution] = useState('');
  const [showResolutionDropdown, setShowResolutionDropdown] = useState(false);
  
  const suggestedResolutions = {
    '2 MP': [
      { label: '1:1 1408x1408', width: '1408', height: '1408' },
      { label: '3:2 1728x1152', width: '1728', height: '1152' },
      { label: '4:3 1664x1216', width: '1664', height: '1216' },
      { label: '16:9 1920x1088', width: '1920', height: '1088' },
      { label: '21:9 2176x960', width: '2176', height: '960' }
    ],
    '1 MP (faster)': [
      { label: '1:1 1024x1024', width: '1024', height: '1024' },
      { label: '3:2 1216x832', width: '1216', height: '832' },
      { label: '4:3 1152x896', width: '1152', height: '896' },
      { label: '16:9 1344x768', width: '1344', height: '768' },
      { label: '21:9 1536x640', width: '1536', height: '640' }
    ]
  };
  
  // Dynamic parameters
  const [dynamicParams, setDynamicParams] = useState([
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
  
  // Help text state
  const [showResolutionHelp, setShowResolutionHelp] = useState(false);
  const [showRequiredFieldsHelp, setShowRequiredFieldsHelp] = useState(false);

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
          
          // Update VideoPlayer with stream data
          const streamData = {
            stream_id: streamId,
            whep_url: statusData.whep_url,
            iframe_html: statusData.iframe_html || '',
            ...statusData
          };
          onStreamUpdate?.(streamData);
          
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

  // Handle resolution selection
  const handleResolutionSelect = (resolution) => {
    setRequiredFields(prev => ({
      ...prev,
      width: resolution.width,
      height: resolution.height
    }));
    setSelectedResolution(resolution.label);
    setShowResolutionDropdown(false);
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
    } else if (parseInt(requiredFields.height) > 1920) {
      errors.push('Height must not exceed 1920 pixels');
    }
    
    if (!requiredFields.width || parseInt(requiredFields.width) <= 0) {
      errors.push('Width must be a positive number');
    } else if (parseInt(requiredFields.width) > 1920) {
      errors.push('Width must not exceed 1920 pixels');
    }
    
    if (!requiredFields.rtmp_url || !requiredFields.rtmp_url.trim()) {
      errors.push('RTMP Output URL is required');
    }
    
    if (!requiredFields.stream_key || !requiredFields.stream_key.trim()) {
      errors.push('Stream Key is required');
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
        stream_key: requiredFields.stream_key.trim(),
        playback_url: requiredFields.playback_url.trim(),
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
        const streamId = result.stream?.stream_id || result.stream_id;
        if (streamId) {
          localStorage.setItem('streamId', streamId);
          setSavedStreamId(streamId);
          console.log('[AdminPanel] Saved streamId:', streamId);
        }
        
        setStreamAlive(true);
        
        // Pass stream data in the format VideoPlayer expects
        const streamData = {
          stream_id: streamId,
          whep_url: result.whep_url,
          iframe_html: result.stream?.iframe_html || '',
          ...result.stream
        };
        
        onStreamUpdate?.(streamData);
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
        const result = await response.json();
        console.log('[AdminPanel] Stream updated successfully');
        
        // Update VideoPlayer with new iframe_html if it was changed
        if (result.stream?.iframe_html !== undefined) {
          const currentStreamData = {
            stream_id: savedStreamId,
            iframe_html: result.stream.iframe_html
          };
          onStreamUpdate?.(currentStreamData);
        }
        
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
                <h3>Recover Stream Control</h3>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                  Enter a streamId to recover control of a running stream on the gateway
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
                
                {/* Capability Name */}
                <div className="form-group">
                  <label className="form-label">Capability Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="image-generation"
                    value={requiredFields.capability_name}
                    onChange={(e) => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        updateRequiredField('capability_name', e.target.value);
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
                  />
                </div>

                {/* Suggested Resolutions Dropdown */}
                <div className="form-group">
                  <label className="form-label">Suggested Resolutions</label>
                  <div className="resolution-dropdown">
                    <button
                      type="button"
                      className={`dropdown-trigger ${streamStatus === 'running' && streamAlive ? 'disabled' : ''}`}
                      onClick={() => {
                        if (streamStatus === 'running' && streamAlive) {
                          setShowResolutionHelp(true);
                          setTimeout(() => setShowResolutionHelp(false), 3000);
                        } else {
                          setShowResolutionDropdown(!showResolutionDropdown);
                        }
                      }}
                      disabled={streamStatus === 'running' && streamAlive}
                    >
                      {selectedResolution || 'Select a resolution...'}
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    
                    {showResolutionDropdown && (
                      <div className="dropdown-content">
                        {Object.entries(suggestedResolutions).map(([category, resolutions]) => (
                          <div key={category} className="dropdown-section">
                            <div className="dropdown-section-header">{category}</div>
                            {resolutions.map((resolution, index) => (
                              <button
                                key={index}
                                type="button"
                                className="dropdown-item"
                                onClick={() => handleResolutionSelect(resolution)}
                              >
                                {resolution.label}
                              </button>
                            ))}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {showResolutionHelp && (
                      <div className="help-text">
                        <Info className="w-4 h-4" />
                        Cannot update resolution when stream is running. Stop the stream to change resolution settings.
                      </div>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Width</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="1344"
                      value={requiredFields.width}
                      onChange={(e) => {
                        if (streamStatus === 'running' && streamAlive) {
                          setShowRequiredFieldsHelp(true);
                          setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                        } else {
                          updateRequiredField('width', e.target.value);
                        }
                      }}
                      disabled={streamStatus === 'running' && streamAlive}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Height</label>
                    <input
                      type="number"
                      className="input"
                      placeholder="768"
                      value={requiredFields.height}
                      onChange={(e) => {
                        if (streamStatus === 'running' && streamAlive) {
                          setShowRequiredFieldsHelp(true);
                          setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                        } else {
                          updateRequiredField('height', e.target.value);
                        }
                      }}
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
                    onChange={(e) => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        updateRtmpUrl(e.target.value);
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Stream Key</label>
                  <input
                    type="password"
                    className="input"
                    placeholder="Enter your stream key"
                    value={requiredFields.stream_key}
                    onChange={(e) => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        updateRequiredField('stream_key', e.target.value);
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Playback URL (Optional)</label>
                  <input
                    type="url"
                    className="input"
                    placeholder="https://example.com/stream.m3u8"
                    value={requiredFields.playback_url}
                    onChange={(e) => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        updateRequiredField('playback_url', e.target.value);
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Iframe HTML (Optional)</label>
                  <textarea
                    className="textarea"
                    placeholder="<iframe src='https://player.example.com/embed/stream' width='1280' height='720'></iframe>"
                    value={requiredFields.iframe_html}
                    onChange={(e) => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        updateRequiredField('iframe_html', e.target.value);
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
                    rows={3}
                  />
                </div>
                
                {showRequiredFieldsHelp && (
                  <div className="help-text">
                    <Info className="w-4 h-4" />
                    Required fields cannot be changed while stream is running. Stop the stream to modify these settings.
                  </div>
                )}
              </div>

              {/* Dynamic Parameters */}
              <div className="admin-section">
                <div className="admin-section-header">
                  <h3>Dynamic Parameters</h3>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      if (streamStatus === 'running' && streamAlive) {
                        setShowRequiredFieldsHelp(true);
                        setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                      } else {
                        addDynamicParam();
                      }
                    }}
                    disabled={streamStatus === 'running' && streamAlive}
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
                        onChange={(e) => {
                          if (streamStatus === 'running' && streamAlive) {
                            setShowRequiredFieldsHelp(true);
                            setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                          } else {
                            updateDynamicParam(index, 'key', e.target.value);
                          }
                        }}
                        disabled={streamStatus === 'running' && streamAlive}
                      />
                      <input
                        className="input"
                        placeholder="Parameter value"
                        value={param.value}
                        onChange={(e) => {
                          if (streamStatus === 'running' && streamAlive) {
                            setShowRequiredFieldsHelp(true);
                            setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                          } else {
                            updateDynamicParam(index, 'value', e.target.value);
                          }
                        }}
                        disabled={streamStatus === 'running' && streamAlive}
                      />
                      <button
                        className="btn btn-secondary"
                        onClick={() => {
                          if (streamStatus === 'running' && streamAlive) {
                            setShowRequiredFieldsHelp(true);
                            setTimeout(() => setShowRequiredFieldsHelp(false), 3000);
                          } else {
                            removeDynamicParam(index);
                          }
                        }}
                        disabled={dynamicParams.length <= 1 || (streamStatus === 'running' && streamAlive)}
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