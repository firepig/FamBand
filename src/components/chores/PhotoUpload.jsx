import { useState, useRef } from 'react';
import { Button, Spinner } from 'react-bootstrap';
import { FaCamera, FaUpload, FaTimes } from 'react-icons/fa';

export default function PhotoUpload({ currentPhoto, onUpload }) {
  const [preview, setPreview] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    try {
      await onUpload(selectedFile);
    } finally {
      setUploading(false);
      setSelectedFile(null);
      setPreview(null);
    }
  };

  const handleCancelPreview = () => {
    setSelectedFile(null);
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleZoneClick = () => {
    fileInputRef.current?.click();
  };

  if (currentPhoto && !preview) {
    return (
      <div className="d-flex flex-column align-items-center gap-2">
        <div
          style={{
            width: '100%',
            maxHeight: 250,
            overflow: 'hidden',
            borderRadius: '8px',
            border: '1px solid #dee2e6',
          }}
        >
          <img
            src={`/photos/${currentPhoto}`}
            alt="Chore proof"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
            }}
          />
        </div>
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleZoneClick}
        >
          <FaCamera className="me-1" />
          Replace Photo
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
        {selectedFile && (
          <div className="d-flex align-items-center gap-2 mt-1">
            <span className="small text-muted">{selectedFile.name}</span>
            {uploading ? (
              <Spinner animation="border" size="sm" />
            ) : (
              <>
                <Button variant="success" size="sm" onClick={handleUpload}>
                  <FaUpload className="me-1" />
                  Upload
                </Button>
                <Button variant="outline-danger" size="sm" onClick={handleCancelPreview}>
                  <FaTimes />
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="d-flex flex-column align-items-center gap-2">
      {preview ? (
        <>
          <div
            style={{
              width: '100%',
              maxHeight: 250,
              overflow: 'hidden',
              borderRadius: '8px',
              border: '1px solid #dee2e6',
            }}
          >
            <img
              src={preview}
              alt="Preview"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
          <div className="d-flex align-items-center gap-2">
            {uploading ? (
              <Spinner animation="border" size="sm" />
            ) : (
              <>
                <Button variant="success" size="sm" onClick={handleUpload}>
                  <FaUpload className="me-1" />
                  Upload
                </Button>
                <Button variant="outline-danger" size="sm" onClick={handleCancelPreview}>
                  <FaTimes />
                </Button>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <div
            onClick={handleZoneClick}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') handleZoneClick();
            }}
            role="button"
            tabIndex={0}
            style={{
              width: '100%',
              minHeight: 120,
              border: '2px dashed #adb5bd',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: '24px',
              backgroundColor: '#f8f9fa',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#e9ecef';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f8f9fa';
            }}
          >
            <FaCamera size={32} className="text-muted mb-2" />
            <span className="text-muted">Click or drop photo</span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </>
      )}
    </div>
  );
}
