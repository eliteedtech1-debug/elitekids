import { useState, useCallback } from 'react';
import { Library, Upload } from 'lucide-react';
import { t } from '@/lib/i18n';
import MediaLibrary from '@/components/MediaLibrary';

/**
 * MediaPicker — drop-in replacement for ImageUpload that adds a
 * "Browse Library" button opening the MediaLibrary modal.
 *
 * Teachers can pick from open-source assets OR upload from their local machine.
 */

interface MediaPickerProps {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  optional?: boolean;
  compact?: boolean;
  /** Accept audio files too (for sound fields) */
  acceptAudio?: boolean;
  /** Called when user selects an audio file from the library */
  onAudioSelect?: (soundUrl: string, label: string) => void;
}

export default function MediaPicker({
  value,
  onChange,
  label = t('mediaPicker.image'),
  optional = true,
  compact = false,
  acceptAudio = false,
  onAudioSelect,
}: MediaPickerProps) {
  const [showLibrary, setShowLibrary] = useState(false);

  const handleLibrarySelect = useCallback((asset: { emoji: string; label: string; imageUrl?: string; soundUrl?: string; soundText?: string }) => {
    if (asset.soundUrl && onAudioSelect) {
      onAudioSelect(asset.soundUrl, asset.label);
    } else if (asset.imageUrl) {
      onChange(asset.imageUrl);
    }
    setShowLibrary(false);
  }, [onChange, onAudioSelect]);

  return (
    <>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-gray-600">{label}{optional ? '' : ' *'}</label>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={t('mediaPicker.placeholder')}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-[#0F4D92] focus:outline-none focus:ring-1 focus:ring-[#0F4D92]/30"
          />
        </div>
        <button
          onClick={() => setShowLibrary(true)}
          className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-medium text-[#0F4D92] hover:bg-blue-50 hover:border-[#0F4D92]/40 transition-colors shrink-0"
          title={t('mediaPicker.browseTitle')}
        >
          <Library className="h-3.5 w-3.5" />
          {t('mediaPicker.library')}
        </button>
      </div>

      {showLibrary && (
        <MediaLibrary
          onSelect={handleLibrarySelect}
          onClose={() => setShowLibrary(false)}
          filter={acceptAudio ? 'all' : 'emoji'}
        />
      )}
    </>
  );
}
