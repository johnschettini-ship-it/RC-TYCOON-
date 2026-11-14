import type { BakeCamera } from './camera';
export declare function makeBakeCamera(
  THREE: any,
  cam: Pick<BakeCamera, 'yawDeg' | 'pitchDeg' | 'pxPerMetre' | 'heightScale'>,
  view: { widthPx: number; heightPx: number; originPx: [number, number] },
  distance?: number,
): { camera: any; modelScale: any };
