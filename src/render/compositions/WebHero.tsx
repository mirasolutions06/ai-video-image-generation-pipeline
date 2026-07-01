import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { TransitionSeries } from '@remotion/transitions';
import { resolveTransition } from '../helpers/transitions.js';
import { secondsToFrames } from '../helpers/timing.js';
import { VideoScene } from '../components/VideoScene.js';
import { FilmGrain } from '../components/FilmGrain.js';
import { Vignette } from '../components/Vignette.js';
import type { VideoConfig, CaptionWord } from '../../types.js';

type Props = {
  config: VideoConfig;
  clipPaths: string[];
  voiceoverPath?: string;
  captions: CaptionWord[];
};

export const WebHero: React.FC<Props> = ({
  config,
  clipPaths,
}) => {
  const { fps } = useVideoConfig();

  const transition = resolveTransition(config.transition);

  const colorGradeFilter = 'contrast(1.08) saturate(1.1) brightness(0.97) sepia(0.08)';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Video clips — no audio, no captions for ambient web hero */}
      <AbsoluteFill style={{ filter: colorGradeFilter }}>
        <TransitionSeries>
          {clipPaths.map((clipPath, i) => {
            const clip = config.clips[i];
            const clipDuration = secondsToFrames(clip?.duration ?? 5, fps);
            const isLastClip = i === clipPaths.length - 1;

            return (
              <React.Fragment key={clipPath}>
                <TransitionSeries.Sequence durationInFrames={clipDuration}>
                  <VideoScene clipPath={clipPath} volume={0} sceneIndex={i} />
                </TransitionSeries.Sequence>
                {!isLastClip && transition !== null && (
                  <TransitionSeries.Transition
                    timing={transition.timing}
                    presentation={transition.presentation}
                  />
                )}
              </React.Fragment>
            );
          })}
        </TransitionSeries>
      </AbsoluteFill>

      {/* Vignette + Film grain */}
      <Vignette intensity={0.35} />
      <FilmGrain opacity={0.04} />
    </AbsoluteFill>
  );
};
