import React, { useMemo } from 'react';
import {
  AbsoluteFill,
  Audio,
  useVideoConfig,
} from 'remotion';
import { TransitionSeries } from '@remotion/transitions';
import { resolveSrc } from '../helpers/resolve-src.js';
import { resolveTransition } from '../helpers/transitions.js';
import { createMusicVolumeCallback } from '../helpers/audio-ducking.js';
import { secondsToFrames } from '../helpers/timing.js';
import { VideoScene } from '../components/VideoScene.js';
import { CaptionTrack } from '../components/CaptionTrack.js';
import { LowerThird } from '../components/LowerThird.js';
import { FilmGrain } from '../components/FilmGrain.js';
import { Vignette } from '../components/Vignette.js';
import type { VideoConfig, CaptionWord } from '../../types.js';

type Props = {
  config: VideoConfig;
  clipPaths: string[];
  voiceoverPath?: string;
  captions: CaptionWord[];
};

export const Ad: React.FC<Props> = ({
  config,
  clipPaths,
  voiceoverPath,
  captions,
}) => {
  const { fps, durationInFrames } = useVideoConfig();

  const showCaptions = config.captions ?? false;
  const musicVolume = config.musicVolume ?? 0.15;
  const captionTheme = config.captionTheme ?? 'bold';
  const transition = resolveTransition(config.transition);

  // Music volume automation: ducks under voiceover, fades in/out
  const musicVolumeCallback = useMemo(
    () =>
      createMusicVolumeCallback({
        captions,
        fps,
        baseVolume: musicVolume,
        totalFrames: durationInFrames,
      }),
    [captions, fps, musicVolume, durationInFrames],
  );

  // Global color grade CSS filter
  const colorGradeFilter = 'contrast(1.08) saturate(1.1) brightness(0.97) sepia(0.08)';

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Video clips — wrapped in color grade filter */}
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

      {/* Vignette + Film grain for visual coherence */}
      <Vignette intensity={0.4} />
      <FilmGrain opacity={0.05} />

      {/* Voiceover — primary audio track at full volume */}
      {voiceoverPath !== undefined && (
        <Audio src={resolveSrc(voiceoverPath)} volume={1} />
      )}

      {/* Background music with ducking — uses music.mp3 in project dir */}
      {config.music === true && (
        <Audio src={resolveSrc('music.mp3')} volume={musicVolumeCallback} />
      )}

      {/* Lower third — shows brand name and title */}
      <LowerThird
        title={config.brand}
        subtitle={config.title}
        startFrame={secondsToFrames(1, fps)}
        endFrame={durationInFrames - secondsToFrames(1, fps)}
      />

      {/* Optional captions */}
      {showCaptions && captions.length > 0 && (
        <CaptionTrack
          words={captions}
          theme={captionTheme}
        />
      )}
    </AbsoluteFill>
  );
};
