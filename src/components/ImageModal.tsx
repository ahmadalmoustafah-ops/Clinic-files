import React, { useState } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Download, Calendar, FileText } from 'lucide-react';
import { MedicalImage } from '../types';

interface ImageModalProps {
  image: MedicalImage | null;
  onClose: () => void;
  onDelete?: (id: string) => void;
}

export const ImageModal: React.FC<ImageModalProps> = ({ image, onClose, onDelete }) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!image) return null;

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation((prev) => (prev + 90) % 360);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col justify-between p-4 transition-all"
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
            onClick={handleZoomIn}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="تكبير"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title="تصغير"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
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
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Image Stage */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden my-3 cursor-grab active:cursor-grabbing"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="transition-transform duration-200 ease-out flex items-center justify-center max-w-full max-h-full"
          style={{
            transform: `scale(${zoom}) rotate(${rotation}deg)`,
          }}
        >
          <img
            src={image.url}
            alt={image.name || 'صورة الفحص الطبي'}
            className="max-h-[75vh] max-w-[90vw] object-contain rounded-lg shadow-2xl select-none"
            referrerPolicy="no-referrer"
          />
        </div>
      </div>

      {/* Bottom info & delete option */}
      <div
        className="flex items-center justify-between text-xs text-slate-400 max-w-2xl mx-auto w-full px-2"
        onClick={(e) => e.stopPropagation()}
      >
        <span>
          نسبة التكبير: {Math.round(zoom * 100)}% · زاوية التدوير: {rotation}°
        </span>
        {onDelete && (
          <button
            onClick={() => {
              if (window.confirm('هل تريد حذف هذه الصورة من الملف الطبي؟')) {
                onDelete(image.id);
                onClose();
              }
            }}
            className="text-rose-400 hover:text-rose-300 hover:underline px-2 py-1"
          >
            حذف الصورة نهائياً
          </button>
        )}
      </div>
    </div>
  );
};
