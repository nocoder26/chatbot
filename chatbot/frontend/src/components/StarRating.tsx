"use client";

import { useState } from "react";
import { Star } from "lucide-react";

interface StarRatingProps {
  onRate: (rating: number) => void;
  currentRating?: number;
  disabled?: boolean;
}

export default function StarRating({
  onRate,
  currentRating = 0,
  disabled = false,
}: StarRatingProps) {
  const [hoveredRating, setHoveredRating] = useState(0);

  const displayRating = hoveredRating || currentRating;

  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => !disabled && onRate(star)}
          onMouseEnter={() => !disabled && setHoveredRating(star)}
          onMouseLeave={() => setHoveredRating(0)}
          disabled={disabled}
          className="p-0.5 transition-transform hover:scale-110 disabled:cursor-default"
        >
          <Star
            className={`w-5 h-5 transition-colors ${
              star <= displayRating
                ? "fill-yellow-400 text-yellow-400"
                : "text-slate-300 dark:text-slate-600"
            }`}
          />
        </button>
      ))}
    </div>
  );
}
