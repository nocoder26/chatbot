"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  rating: number;
}

export default function FeedbackModal({
  isOpen,
  onClose,
  onSubmit,
  rating,
}: FeedbackModalProps) {
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await onSubmit(comment);
    setIsSubmitting(false);
    setComment("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50
                       bg-white dark:bg-slate-800 rounded-xl shadow-xl p-6 w-full max-w-md"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-white">
                Help us improve
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              You rated this response {rating} star{rating !== 1 ? "s" : ""}.
              Please tell us what could be improved.
            </p>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What was wrong with this response?"
              className="w-full h-32 p-3 border border-slate-300 dark:border-slate-600 rounded-lg
                         bg-white dark:bg-slate-700 text-slate-800 dark:text-white
                         placeholder-slate-400 resize-none
                         focus:outline-none focus:ring-2 focus:ring-teal-500"
            />

            {/* Actions */}
            <div className="flex gap-3 mt-4">
              <button
                onClick={onClose}
                className="flex-1 py-2 px-4 rounded-lg border border-slate-300 dark:border-slate-600
                           text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700
                           transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-2 px-4 rounded-lg bg-teal-600 text-white
                           hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {isSubmitting ? "Submitting..." : "Submit"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
