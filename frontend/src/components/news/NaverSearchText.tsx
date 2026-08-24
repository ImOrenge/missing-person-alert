import React from 'react';

interface NaverSearchTextProps {
  value: string;
  className?: string;
}

const decodeEntities = (value: string): string => {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  return value
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#x')) {
        const codePoint = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      }
      if (entity.startsWith('#')) {
        const codePoint = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : match;
      }
      return named[entity.toLowerCase()] ?? match;
    });
};

export default function NaverSearchText({ value, className }: NaverSearchTextProps) {
  const tokens = value.split(/(<\/?b>)/gi);
  let emphasized = false;

  return (
    <span className={className}>
      {tokens.map((token, index) => {
        if (/^<b>$/i.test(token)) {
          emphasized = true;
          return null;
        }
        if (/^<\/b>$/i.test(token)) {
          emphasized = false;
          return null;
        }
        const text = decodeEntities(token);
        return emphasized ? <strong key={index}>{text}</strong> : <React.Fragment key={index}>{text}</React.Fragment>;
      })}
    </span>
  );
}
