import React, { useEffect, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, Calendar, FileText } from 'lucide-react';
import { MedicalImage } from '../types';

interface ImageModalProps {
  image: MedicalImage | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 5;

function clampZoom(val: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, val));
}

function getTouchDistance(t1: React.Touch, t2: React.Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, onClose, onDelete }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isGesturing, setIsGesturing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pinchRef = useRef<{ initialDist: number; initialZoom: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panStateRef = useRef(pan);
  panStateRef.current = pan;

  useEffect(() => {
    setZoom(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
    setConfirmingDelete(false);
    pinchRef.current = null;
    panRef.current = null;
  }, [image?.id]);

  if (!image) return null;

  const applyZoom = (next: number) => {
    const clamped = clampZoom(next);
    setZoom(clamped);
    if (clamped <= 1) {
      setPan({ x: 0, y: 0 });
    }
  };

  const handleZoomIn = () => applyZoom(zoom + 0.35);
  const handleZoomOut = () => applyZoom(zoom - 0.35);
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      panRef.current = null;
      setIsGesturing(true);
      pinchRef.current = {
        initialDist: getTouchDistance(e.touches[0], e.touches[1]),
        initialZoom: zoomRef.current,
      };
      return;
    }

    if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 280) {
        lastTapTimeRef.current = 0;
        setIsGesturing(false);
        if (zoomRef.current > 1.1) {
          applyZoom(1);
        } else {
          applyZoom(2.2);
        }
        return;
      }
      lastTapTimeRef.current = now;

      if (zoomRef.current > 1.05) {
        setIsGesturing(true);
        panRef.current = {
          startX: e.touches[0].clientX,
          startY: e.touches[0].clientY,
          initialPanX: panStateRef.current.x,
          initialPanY: panStateRef.current.y,
        };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = getTouchDistance(e.touches[0], e.touches[1]);
      if (pinchRef.current.initialDist > 0) {
        const nextZoom = clampZoom(
          pinchRef.current.initialZoom * (dist / pinchRef.current.initialDist)
        );
        setZoom(nextZoom);
        if (nextZoom <= 1) {
          setPan({ x: 0, y: 0 });
        }
      }
      return;
    }

    if (e.touches.length === 1 && panRef.current && zoomRef.current > 1.05) {
      e.preventDefault();
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setPan({
        x: panRef.current.initialPanX + dx,
        y: panRef.current.initialPanY + dy,
      });
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      panRef.current = null;
      setIsGesturing(false);
    } else if (e.touches.length === 1 && zoomRef.current > 1.05) {
      panRef.current = {
        startX: e.touches[0].clientX,
        startY: e.touches[0].clientY,
        initialPanX: panStateRef.current.x,
        initialPanY: panStateRef.current.y,
      };
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    applyZoom(zoomRef.current + delta);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 transition-all"
      onClick={onClose}
    >
      {/* Top action bar */}
      <div
        className="flex items-center justify-between bg-slate-900/90 text-white px-4 py-2.5 rounded-2xl border border-slate-800 shadow-xl max-w-2xl mx-auto w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <FileText className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <h4 className="text-sm font-semibold truncate">{image.name || 'صورة طبية'}</h4>
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <Calendar className="w-3 h-3" />
              <span>{image.date}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="تصغير"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleRotate}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="تدوير"
          >
            <RotateCw className="w-4 h-4" />
          </button>
          <a
            href={image.url}
            download={image.name || 'medical-scan.jpg'}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="تحميل"
          >
            <Download className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage (Supports Two-Finger Pinch Zoom & Pan) */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden my-3 touch-none select-none cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onWheel={handleWheel}
      >
        <div
          className={`flex items-center justify-center max-w-full max-h-full ${
            isGesturing ? '' : 'transition-transform duration-150 ease-out'
          }`}
          style={{
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          <img
            src={image.url}
            alt={image.name || 'صورة الفحص الطبي'}
            draggable={false}
            className="max-h-[75vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none pointer-events-none"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bottom info & delete option */}
      <div
        className="flex items-center justify-between gap-2 text-xs text-slate-400 max-w-2xl mx-auto w-full px-2 flex-wrap"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          نسبة التكبير: {Math.round(zoom * 100)}% · زاوية التدوير: {rotation}°
        </span>
        {onDelete && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-rose-400 hover:text-rose-300 hover:underline px-2 py-1 cursor-pointer"
          >
            حذف الصورة نهائياً
          </button>
        )}
        {onDelete && confirmingDelete && (
          <div className="flex items-center gap-2 bg-rose-950/80 border border-rose-700 px-3 py-1.5 rounded-xl">
            <span className="text-rose-200 font-bold">تأكيد الحذف؟</span>
            <button
              type="button"
              onClick={() => {
                onDelete(image.id);
                onClose();
              }}
              className="px-2.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
            >
              نعم، حذف
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer"
            >
              إلغاء
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
