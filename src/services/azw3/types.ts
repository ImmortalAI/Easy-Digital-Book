import type { BookMetadata } from "@/types/book";

export interface KindlePosition {
  fid: number;
  offset: number;
  reconstructedOffset: number;
}

export interface Azw3ResourcePlan {
  records: Uint8Array[];
  imageIndices: ReadonlyMap<string, number>;
  coverIndex: number | null;
  thumbnailIndex: number | null;
}

export interface HeaderInput {
  metadata: BookMetadata;
  displayTitle: string;
  exportedAt: Date;
  textLength: number;
  textRecordCount: number;
  recordIndices: ReadonlyMap<string, number>;
  resourceCount: number;
  coverIndex: number | null;
  thumbnailIndex: number | null;
  flowCount: number;
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
