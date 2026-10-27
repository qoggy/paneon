import { createContext, useContext } from 'react';
import type { FileReferenceRequest, FilePreview } from '../shared/file-references';

export type ReadFileReference = (request: FileReferenceRequest) => Promise<FilePreview>;
export const FileReferenceContext = createContext<ReadFileReference | undefined>(undefined);
export const useFileReference = () => useContext(FileReferenceContext);
