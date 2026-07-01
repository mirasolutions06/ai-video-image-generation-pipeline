import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionWord, CaptionTheme } from '../../types.js';

interface CaptionLine {
  words: CaptionWord[];
  /** Start time of the first word in this line (seconds) */
  lineStart: number;
  /** End time of the last word in this line (seconds) */
  lineEnd: number;
}

interface CaptionTrackProps {
  words: CaptionWord[];
  theme?: CaptionTheme;
  /** Maximum characters per caption line. Default: 25 */
  maxCharsPerLine?: number;
  fontFamily?: string;
}

// ─── Caption helpers (inlined — v3 has no pipeline/captions module) ────────

/**
 * Groups CaptionWords into display lines based on a maximum character limit.
 */
function groupWordsIntoLines(words: CaptionWord[], maxCharsPerLine = 25): CaptionLine[] {
  const lines: CaptionLine[] = [];
  let currentLine: CaptionWord[] = [];
  let currentLength = 0;

  for (const word of words) {
    const wordLength = word.word.length + (currentLine.length > 0 ? 1 : 0);

    if (currentLength + wordLength > maxCharsPerLine && currentLine.length > 0) {
      const firstWord = currentLine[0];
      const lastWord = currentLine[currentLine.length - 1];
      if (firstWord && lastWord) {
        lines.push({
          words: currentLine,
          lineStart: firstWord.start,
          lineEnd: lastWord.end,
        });
      }
      currentLine = [word];
      currentLength = word.word.length;
    } else {
      currentLine.push(word);
      currentLength += wordLength;
    }
  }

  if (currentLine.length > 0) {
    const firstWord = currentLine[0];
    const lastWord = currentLine[currentLine.length - 1];
    if (firstWord && lastWord) {
      lines.push({
        words: currentLine,
        lineStart: firstWord.start,
        lineEnd: lastWord.end,
      });
    }
  }

  return lines;
}

/**
 * Finds the index of the word currently being spoken at a given time.
 * Returns -1 if no word is active at that time (between words or before/after speech).
 */
function getActiveWordIndex(words: CaptionWord[], currentTimeSeconds: number): number {
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (!word) continue;
    if (currentTimeSeconds >= word.start && currentTimeSeconds <= word.end) {
      return i;
    }
  }
  return -1;
}

// ─── Theme definitions ─────────────────────────────────────────────────────

interface ThemeStyles {
  container: React.CSSProperties;
  activeWord: React.CSSProperties;
  inactiveWord: React.CSSProperties;
}

function getTheme(theme: CaptionTheme, fontFamily: string): ThemeStyles {
  switch (theme) {
    case 'bold':
      return {
        container: {
          fontFamily,
          fontSize: 64,
          fontWeight: 900,
          lineHeight: 1.3,
          textAlign: 'center',
          textTransform: 'uppercase' as const,
          padding: '0 24px',
          wordBreak: 'break-word' as const,
        },
        activeWord: {
          display: 'inline-block',
          color: '#000',
          backgroundColor: '#FACC15',
          padding: '4px 12px',
          borderRadius: 8,
          margin: '2px 3px',
          transform: 'scale(1.05)',
          filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
        },
        inactiveWord: {
          display: 'inline-block',
          color: 'white',
          padding: '4px 12px',
          borderRadius: 8,
          margin: '2px 3px',
          backgroundColor: 'rgba(0,0,0,0.6)',
          filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
        },
      };

    case 'editorial':
      return {
        container: {
          fontFamily,
          fontSize: 48,
          fontWeight: 500,
          lineHeight: 1.4,
          textAlign: 'center',
          letterSpacing: '0.02em',
          padding: '0 60px',
          wordBreak: 'break-word' as const,
        },
        activeWord: {
          display: 'inline-block',
          color: 'white',
          borderBottom: '3px solid #FACC15',
          paddingBottom: 2,
          margin: '0 4px',
          fontWeight: 700,
          filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.6))',
        },
        inactiveWord: {
          display: 'inline-block',
          color: 'rgba(255,255,255,0.85)',
          margin: '0 4px',
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.5))',
        },
      };

    case 'minimal':
    default:
      return {
        container: {
          fontFamily,
          fontSize: 52,
          fontWeight: 600,
          lineHeight: 1.3,
          textAlign: 'center',
          padding: '0 40px',
          wordBreak: 'break-word' as const,
        },
        activeWord: {
          display: 'inline-block',
          color: 'white',
          margin: '0 4px',
          opacity: 1,
          fontWeight: 700,
          textShadow: '0 2px 8px rgba(0,0,0,0.7)',
        },
        inactiveWord: {
          display: 'inline-block',
          color: 'white',
          margin: '0 4px',
          opacity: 0.5,
          textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        },
      };
  }
}

const POSITION_STYLE: React.CSSProperties = {
  position: 'absolute',
  bottom: 120,
  left: 0,
  right: 0,
};

/**
 * CaptionTrack renders animated word-by-word captions synced to Whisper word timestamps.
 *
 * Supports three visual themes:
 *   - 'bold': TikTok/CapCut style — pill backgrounds, brand color highlight on active word
 *   - 'editorial': Clean luxury — subtle shadow, brand-colored underline on active word
 *   - 'minimal': Simple white text with opacity-based word highlighting
 */
export const CaptionTrack: React.FC<CaptionTrackProps> = ({
  words,
  theme = 'bold',
  maxCharsPerLine = 25,
  fontFamily = 'sans-serif',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeSec = frame / fps;

  const themeStyles = useMemo(() => getTheme(theme, fontFamily), [theme, fontFamily]);

  const lines = useMemo(
    () => groupWordsIntoLines(words, maxCharsPerLine),
    [words, maxCharsPerLine],
  );

  const activeWordIndex = getActiveWordIndex(words, currentTimeSec);

  const activeLine = useMemo(() => {
    if (activeWordIndex === -1) return null;
    const activeWord = words[activeWordIndex];
    if (!activeWord) return null;

    return (
      lines.find((l) =>
        l.words.some(
          (w) => w.start === activeWord.start && w.word === activeWord.word,
        ),
      ) ?? null
    );
  }, [activeWordIndex, words, lines]);

  if (words.length === 0) return null;
  if (!activeLine) return null;

  return (
    <div style={POSITION_STYLE}>
      <div
        style={{
          ...themeStyles.container,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {activeLine.words.map((word, idx) => {
          const globalIdx = words.findIndex(
            (w) => w.start === word.start && w.word === word.word,
          );
          const isActive = globalIdx === activeWordIndex;

          return (
            <span
              key={`${word.word}-${word.start}-${idx}`}
              style={isActive ? themeStyles.activeWord : themeStyles.inactiveWord}
            >
              {word.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
