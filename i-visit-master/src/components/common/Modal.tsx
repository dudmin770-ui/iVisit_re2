import type { ReactNode } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export default function Modal({
  isOpen,
  onClose,
  title,
  children,
}: ModalProps) {
  if (!isOpen) return null;

  const portalTarget =
    document.getElementById("root") ?? document.body;

  return createPortal(
  <div className="fixed inset-0 z-[100] flex items-center justify-center">
    {/* Backdrop */}
    <div
      className="absolute inset-0 bg-black/60"
      onClick={onClose}
    />

    {/* Modal Panel */}
    <div className="
        relative z-[101]
        w-full max-w-xl mx-4
        bg-dark-gray rounded-lg shadow-lg
        text-white                
        max-h-[85vh] flex flex-col
      "
    >
      {/* Header */}
      <div className="
          flex justify-between items-center
          px-6 pt-4 pb-3
          border-b border-white/10
        "
      >
        {title && <h2 className="text-lg font-semibold">{title}</h2>}
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-200 transition"
        >
          ✕
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="px-6 pb-6 pt-3 overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </div>
  </div>,
  portalTarget
);
}