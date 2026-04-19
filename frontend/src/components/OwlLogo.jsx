import React from "react";

export const OwlLogo = ({ size = 40, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="Ñacurutu Owl"
  >
    {/* Body */}
    <path
      d="M32 58c-11 0-19-8-19-21 0-10 5-17 12-21 2-1 2-2 2-4 0-2 2-4 5-4s5 2 5 4c0 2 0 3 2 4 7 4 12 11 12 21 0 13-8 21-19 21z"
      fill="#18181b"
      stroke="#e11d48"
      strokeWidth="2"
    />
    {/* Left ear tuft */}
    <path d="M16 20 L10 8 L22 14 Z" fill="#e11d48" />
    {/* Right ear tuft */}
    <path d="M48 20 L54 8 L42 14 Z" fill="#e11d48" />
    {/* Left eye */}
    <circle cx="24" cy="30" r="7" fill="#fbbf24" />
    <circle cx="24" cy="30" r="3" fill="#09090b" />
    {/* Right eye */}
    <circle cx="40" cy="30" r="7" fill="#fbbf24" />
    <circle cx="40" cy="30" r="3" fill="#09090b" />
    {/* Beak */}
    <path d="M32 36 L28 42 L36 42 Z" fill="#fbbf24" />
    {/* Chest feather detail */}
    <path
      d="M32 44 Q28 48 32 52 Q36 48 32 44"
      fill="none"
      stroke="#3f3f46"
      strokeWidth="1.5"
    />
  </svg>
);

export default OwlLogo;
