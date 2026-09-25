'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Download, ImagePlus, Loader2, Trash2, X } from 'lucide-react';
import { PackListSkeleton } from './Skeleton';
import { useChat } from './ChatProvider';
import { checkImageFile } from './ImagePreview';
import { api } from '@/lib/client';
import { useEscapeKey } from '@/hooks/useEscapeKey';

// 🌟 Sticker packs everyone can install, and a way to make one.
// Packs never show who made them — only the pack's name.

export default function StickerStore({ onClose, onError }) {
  const { stickerPacks, installPack, deletePack } = useChat();
  const [packs, setPacks] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  useEscapeKey(onClose);

  async function load() {
    try {
      const { packs: all } = await api('/api/stickers/packs');
      setPacks(all);
    } catch (err) {
      onError(err.message);
      setPacks([]);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerPacks]);

  async function toggle(pack) {
    setBusyId(pack._id);
    try {
      await installPack(pack._id, !pack.isInstalled);
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId('');
    }
  }

  async function remove(pack) {
    setBusyId(pack._id);
    try {
      await deletePack(pack._id);
      await load();
    } catch (err) {
      onError(err.message);
    } finally {
      setBusyId('');
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        role="dialog"
        aria-label="Sticker packs"
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-3xl bg-panel pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-3xl"
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        exit={{ y: 40 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-lg font-semibold">🌟 Sticker packs</h2>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-hover"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {isCreating ? (
          <CreatePack onDone={() => setIsCreating(false)} onError={onError} />
        ) : (
          <>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5">
              {packs === null ? (
                <PackListSkeleton />
              ) : packs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  No packs yet. Make the first one!
                </p>
              ) : (
                packs.map((pack) => (
                  <div key={pack._id} className="border-b border-line py-3 last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {pack.name}
                          {!pack.isPublic && <span className="ml-1.5 text-[11px] font-normal text-muted">🔒 Just for me</span>}
                        </p>
                        <p className="text-xs text-muted">
                          {pack.stickers.length} stickers
                          {pack.isPublic && ` · ${pack.installs} ${pack.installs === 1 ? 'install' : 'installs'}`}
                        </p>
                      </div>
                      {pack.isMine && (
                        <button
                          onClick={() => remove(pack)}
                          disabled={busyId === pack._id}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-red-600 disabled:opacity-50"
                          aria-label={`Delete ${pack.name} for everyone`}
                          title="Delete this pack for everyone"
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                      <button
                        onClick={() => toggle(pack)}
                        disabled={busyId === pack._id}
                        aria-label={`${pack.isInstalled ? 'Remove' : 'Add'} ${pack.name}`}
                        className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                          pack.isInstalled ? 'border border-line hover:bg-hover' : 'bg-brand text-on-brand hover:bg-brand-strong'
                        }`}
                      >
                        {busyId === pack._id ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : pack.isInstalled ? (
                          <>
                            <Check size={15} /> Added
                          </>
                        ) : (
                          <>
                            <Download size={15} /> Add
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-2 flex gap-1.5 overflow-x-auto">
                      {pack.stickers.slice(0, 8).map((sticker) => (
                        <img key={sticker._id} src={sticker.url} alt="" className="h-14 w-14 shrink-0 object-contain" />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 pt-3">
              <button
                onClick={() => setIsCreating(true)}
                className="w-full rounded-full bg-brand py-2.5 font-medium text-on-brand hover:bg-brand-strong"
              >
                + Make a pack
              </button>
            </div>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

function CreatePack({ onDone, onError }) {
  const { createPack } = useChat();
  const [name, setName] = useState('');
  const [files, setFiles] = useState([]);
  const [who, setWho] = useState('me'); // me | everyone
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const [previews, setPreviews] = useState([]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  function pick(event) {
    const picked = [...(event.target.files || [])];
    event.target.value = '';
    for (const file of picked) {
      const problem = checkImageFile(file);
      if (problem) return onError(problem);
    }
    setFiles((prev) => [...prev, ...picked].slice(0, 30));
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await createPack(name.trim(), files, who === 'everyone');
      onDone();
    } catch (err) {
      onError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 pb-1">
      <label className="mb-1 block text-sm font-medium">Pack name</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={30}
        placeholder="e.g. Sleepy Cats"
        className="w-full rounded-xl border border-line bg-panel-soft px-3.5 py-2.5 text-base outline-none focus:border-brand md:text-sm"
      />

      <div className="mt-3 grid grid-cols-4 gap-1.5">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex h-16 flex-col items-center justify-center rounded-xl border border-dashed border-line text-muted hover:bg-hover"
        >
          <ImagePlus size={18} />
          <span className="text-[10px]">Pictures</span>
        </button>
        {previews.map((url, i) => (
          <div key={url} className="relative">
            <img src={url} alt="" className="h-16 w-full rounded-xl object-contain" />
            <button
              type="button"
              onClick={() => setFiles((prev) => prev.filter((_, index) => index !== i))}
              className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-white"
              aria-label="Remove this picture"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={pick} className="hidden" />

      {/* Who gets to see this pack */}
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Who can use this pack?">
        {[
          ['me', '🔒 Just for me', 'Only in your own picker'],
          ['everyone', '🌍 Everyone', 'Anyone can add it'],
        ].map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={who === key}
            onClick={() => setWho(key)}
            className={`rounded-2xl border px-3 py-2 text-left transition ${
              who === key ? 'border-brand bg-brand-soft' : 'border-line hover:bg-hover'
            }`}
          >
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-[11px] text-muted">{hint}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 rounded-xl bg-panel-soft px-3.5 py-2.5 text-xs text-muted">
        {who === 'everyone'
          ? '⚠️ A public pack is there for everyone using Ghosted to add. Your name isn’t shown, but the pictures are. Only publish pictures you’re happy to share and have the right to use.'
          : 'Nobody else sees this pack. When you send one of its stickers, a copy of the picture goes to that chat, encrypted like a photo.'}{' '}
        You can delete it later, which removes it for anyone who added it.
      </p>

      <div className="mt-3 flex gap-2 pb-2">
        <button type="button" onClick={onDone} className="flex-1 rounded-full border border-line py-2.5 font-medium hover:bg-hover">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || name.trim().length < 2 || files.length === 0}
          className="flex-1 rounded-full bg-brand py-2.5 font-medium text-on-brand hover:bg-brand-strong disabled:opacity-50"
        >
          {busy ? 'Publishing…' : `Publish ${files.length || ''}`.trim()}
        </button>
      </div>
    </form>
  );
}
