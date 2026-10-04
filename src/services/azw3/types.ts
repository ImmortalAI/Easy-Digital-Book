export interface KindlePosition {
  fid: number;
  offset: number;
  reconstructedOffset: number;
}
export interface TextLayout {
  text: Uint8Array;
  skeletons: Array<{
    fileIndex: number;
    key: string;
    fragmentCount: number;
    physicalStart: number;
    skeletonByteLength: number;
    reconstructedStart: number;
    reconstructedLength: number;
  }>;
  fragments: Array<{
    fileIndex: number;
    globalFragmentIndex: number;
    selector: string;
    insertionOffset: number;
    fragmentStart: number;
    byteLength: number;
    bytes: Uint8Array;
  }>;
  flows: Array<{ start: number; end: number }>;
  positions: ReadonlyMap<string, KindlePosition>;
}
