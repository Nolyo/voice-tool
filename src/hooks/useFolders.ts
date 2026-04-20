import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface FolderMeta {
  id: string;
  name: string;
  createdAt: string;
  order: number;
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
    setFolders(prev => [...prev, meta].sort((a, b) => a.order - b.order));
    return meta;
  };

  const renameFolder = async (id: string, name: string): Promise<FolderMeta> => {
    const updated = await invoke<FolderMeta>('rename_folder', { id, name });
    setFolders(prev => prev.map(f => f.id === id ? updated : f));
    return updated;
  };

  const deleteFolder = async (id: string): Promise<void> => {
    await invoke('delete_folder', { id });
    setFolders(prev => prev.filter(f => f.id !== id));
  };

  const reorderFolders = async (ids: string[]): Promise<void> => {
    setFolders(prev => {
      const indexOf = new Map(ids.map((id, i) => [id, i]));
      return [...prev]
        .map(f => {
          const idx = indexOf.get(f.id);
          return idx !== undefined ? { ...f, order: idx } : f;
        })
        .sort((a, b) => a.order - b.order);
    });
    try {
      await invoke('reorder_folders', { ids });
    } catch (error) {
      console.error('Failed to reorder folders:', error);
      await loadFolders();
    }
  };

  return {
    folders,
    isLoading,
    loadFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    reorderFolders,
    reloadFolders: loadFolders,
  };
}
