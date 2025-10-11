export interface AudioChunk {
  index: number;
  text: string;
  url: string;
}

export interface Manifest {
  job_id: string;
  voice: string;
  chunks: AudioChunk[];
}