export declare const TEXT_FILE_MAX_BYTES: number;
/** Also copied into the packaged Skill by build:cli, so standalone panels share this implementation. */
export declare function readTextFile(
  path: string,
  {
    preserveBOM,
  }?: {
    preserveBOM?: boolean;
  },
): Promise<string>;
