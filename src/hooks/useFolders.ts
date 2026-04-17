import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface FolderMeta {
  id: string;
  name: string;
  createdAt: string;
}

export function useFolders() {
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadFolders = useCallback(async () => {
    try {
      setIsLoading(true);
      const result = await invoke<FolderMeta[]>('list_folders');
      setFolders(result);
    } catch (error) {
      console.error('Failed to load folders:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const createFolder = async (name: string): Promise<FolderMeta> => {
    const meta = await invoke<FolderMeta>('create_folder', { name });
    setFolders(prev => [...prev, meta].sort((a, b) =>
      a.name.toLowerCase().localeCompare(b.name.toLowerCase())
    ));
    return meta;
  };

  const renameFolder = async (id: string, name: string): Promise<FolderMeta> => {
    const updated = await invoke<FolderMeta>('rename_folder', { id, name });
    setFolders(prev => prev
      .map(f => f.id === id ? updated : f)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
    );
    return updated;
  };

  const deleteFolder = async (id: string): Promise<void> => {
    await invoke('delete_folder', { id });
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  return {
    folders,
    isLoading,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    reloadFolders: loadFolders,
  };
}
