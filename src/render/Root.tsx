import { Composition } from 'remotion';
import { YoutubeShort } from './compositions/YoutubeShort.js';
import { Ad } from './compositions/Ad.js';
import { WebHero } from './compositions/WebHero.js';
import type { VideoConfig, CaptionWord } from '../types.js';

const DEFAULT_CONFIG: VideoConfig = {
  mode: 'video',
  title: 'Preview',
  brand: 'Brand',
  format: 'youtube-short',
  clips: [{ prompt: 'preview', imageReference: '', duration: 5 }],
};

const DEFAULT_PROPS: {
  config: VideoConfig;
  clipPaths: string[];
  voiceoverPath?: string;
  captions: CaptionWord[];
} = {
  config: DEFAULT_CONFIG,
  clipPaths: [],
  captions: [],
};

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="YoutubeShort"
        component={YoutubeShort}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="TikTok"
        component={YoutubeShort}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_PROPS}
      />
      <Composition
        id="Ad"
        component={Ad}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ...DEFAULT_PROPS, config: { ...DEFAULT_CONFIG, format: 'ad-16x9' } }}
      />
      <Composition
        id="WebHero"
        component={WebHero}
        durationInFrames={300}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ ...DEFAULT_PROPS, config: { ...DEFAULT_CONFIG, format: 'web-hero' } }}
      />
    </>
  );
};
