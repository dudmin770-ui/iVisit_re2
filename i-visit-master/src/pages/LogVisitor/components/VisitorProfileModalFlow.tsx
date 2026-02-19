// src/pages/LogVisitor/components/VisitorProfileModalController.tsx
import { useState } from "react";
import { type Visitor } from "../../../api/Index";

export function useVisitorProfileModalController() {
  const [isOpen, setIsOpen] = useState(false);
  const [visitor, setVisitor] = useState<Visitor | null>(null);

  const openProfile = (v: Visitor) => {
    setVisitor(v);
    setIsOpen(true);
  };

  const closeProfile = () => {
    setIsOpen(false);
    setVisitor(null);
  };

  return {
    isOpen,
    visitor,
    openProfile,
    closeProfile,
  };
}
