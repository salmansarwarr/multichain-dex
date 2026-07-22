'use client';

import { useState } from 'react';
import { Token } from '@/data/tokens';

interface TokenIconProps {
  token: Token;
  className?: string;
}

// Renders the token's logo when available, falling back to a letter avatar
// when there's no logoURI (e.g. Alfat pending an asset) or the image 404s.
export function TokenIcon({ token, className = 'w-6 h-6' }: TokenIconProps) {
  const [errored, setErrored] = useState(false);

  if (token.logoURI && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external logo hosts, not worth configuring next/image remotePatterns for
      <img
        src={token.logoURI}
        alt={token.symbol}
        className={`rounded-full object-cover shrink-0 ${className}`}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-br from-primary/80 to-purple-500/80 flex items-center justify-center font-bold shrink-0 ${className}`}
    >
      {token.symbol[0]}
    </div>
  );
}
