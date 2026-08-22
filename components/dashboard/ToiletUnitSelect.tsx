'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import {
  Check,
  ChevronDown,
  MapPin,
  Search,
  X,
} from 'lucide-react';
import type { Device } from '@/types';

interface ToiletUnitSelectProps {
  id?: string;
  value: string;
  onChange: (deviceId: string) => void;
  devices: Device[];
  loading?: boolean;
  disabled?: boolean;
  accentColor?: 'amber' | 'primary';
  placeholder?: string;
  ariaLabel?: string;
}

const FLOOR_ORDER = [
  '1st Floor',
  '2nd Floor',
  '3rd Floor',
  '4th Floor',
  '5th Floor',
  'SDCA Annex Building',
  'Other Facilities',
];

function getFloorCategory(nameOrId: string): string {
  const normalized = nameOrId.trim();
  if (/^1F\b/i.test(normalized) || /1st\s*floor/i.test(normalized) || /ground/i.test(normalized)) {
    return '1st Floor';
  }
  if (/^2F\b/i.test(normalized) || /2nd\s*floor/i.test(normalized)) {
    return '2nd Floor';
  }
  if (/^3F\b/i.test(normalized) || /3rd\s*floor/i.test(normalized)) {
    return '3rd Floor';
  }
  if (/^4F\b/i.test(normalized) || /4th\s*floor/i.test(normalized)) {
    return '4th Floor';
  }
  if (/^5F\b/i.test(normalized) || /5th\s*floor/i.test(normalized)) {
    return '5th Floor';
  }
  if (/annex/i.test(normalized)) {
    return 'SDCA Annex Building';
  }
  return 'Other Facilities';
}

function cleanDeviceName(name?: string, id?: string): string {
  const raw = name || id || 'Unknown Unit';
  // Remove any legacy status suffix like (online) or (offline) if present in raw string
  return raw.replace(/\s*\((online|offline)\)\s*$/i, '').trim();
}

export function ToiletUnitSelect({
  id,
  value,
  onChange,
  devices,
  loading = false,
  disabled = false,
  accentColor = 'amber',
  placeholder = 'Select a toilet unit...',
  ariaLabel = 'Select Toilet Unit',
}: ToiletUnitSelectProps) {
  const generatedId = useId();
  const selectId = id || `toilet-select-${generatedId}`;
  const listboxId = `toilet-listbox-${generatedId}`;

  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.id === value) ?? null,
    [devices, value],
  );

  const selectedLabel = selectedDevice
    ? cleanDeviceName(selectedDevice.name, selectedDevice.id)
    : value || placeholder;

  // Filtered list based on search query
  const filteredDevices = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return devices;
    }

    return devices.filter((device) => {
      const name = cleanDeviceName(device.name, device.id).toLowerCase();
      const floor = getFloorCategory(device.name || device.id).toLowerCase();
      const devId = device.id.toLowerCase();
      return name.includes(query) || floor.includes(query) || devId.includes(query);
    });
  }, [devices, searchQuery]);

  // Group filtered devices by floor
  const groupedDevices = useMemo(() => {
    const groups = new Map<string, Device[]>();

    for (const device of filteredDevices) {
      const category = getFloorCategory(device.name || device.id);
      const existing = groups.get(category);
      if (existing) {
        existing.push(device);
      } else {
        groups.set(category, [device]);
      }
    }

    // Sort groups based on standard floor ordering
    return Array.from(groups.entries()).sort(([catA], [catB]) => {
      const idxA = FLOOR_ORDER.indexOf(catA);
      const idxB = FLOOR_ORDER.indexOf(catB);
      const orderA = idxA === -1 ? 99 : idxA;
      const orderB = idxB === -1 ? 99 : idxB;
      return orderA - orderB;
    });
  }, [filteredDevices]);

  // Flat array of currently visible device IDs for keyboard indexing
  const flatVisibleDevices = useMemo(
    () => groupedDevices.flatMap(([, items]) => items),
    [groupedDevices],
  );

  const handleOpen = useCallback(() => {
    setHighlightedIndex(-1);
    setIsOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setSearchQuery('');
    setHighlightedIndex(-1);
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        handleClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen, handleClose]);

  // Focus search input when opening
  useEffect(() => {
    if (!isOpen) return;

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  const handleSelect = (deviceId: string) => {
    onChange(deviceId);
    handleClose();
    triggerButtonRef.current?.focus();
  };

  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };

  const handleListKeyDown = (event: KeyboardEvent<HTMLDivElement | HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      triggerButtonRef.current?.focus();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev + 1;
        return next >= flatVisibleDevices.length ? 0 : next;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((prev) => {
        const next = prev - 1;
        return next < 0 ? flatVisibleDevices.length - 1 : next;
      });
      return;
    }

    if (event.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < flatVisibleDevices.length) {
      event.preventDefault();
      const targetDevice = flatVisibleDevices[highlightedIndex];
      if (targetDevice) {
        handleSelect(targetDevice.id);
      }
    }
  };

  if (loading) {
    return <div className="skeleton h-12 w-full rounded-xl" />;
  }

  const isAmber = accentColor === 'amber';
  const triggerRingClass = isAmber
    ? 'focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20'
    : 'focus:border-primary focus:ring-2 focus:ring-primary/20';

  const badgeClass = isAmber
    ? 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
    : 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-rose-400';

  const activeItemClass = isAmber
    ? 'bg-amber-500/15 text-amber-900 dark:bg-amber-500/25 dark:text-amber-200 font-semibold'
    : 'bg-primary/15 text-primary-dark dark:bg-primary/25 dark:text-rose-200 font-semibold';

  const hoverItemClass = isAmber
    ? 'hover:bg-amber-500/10 dark:hover:bg-amber-500/15'
    : 'hover:bg-primary/10 dark:hover:bg-primary/15';

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        ref={triggerButtonRef}
        id={selectId}
        type="button"
        disabled={disabled || devices.length === 0}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={ariaLabel}
        onClick={() => (isOpen ? handleClose() : handleOpen())}
        onKeyDown={handleTriggerKeyDown}
        className={`group flex min-h-[46px] w-full items-center justify-between gap-3 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-left text-sm shadow-sm transition-all dark:border-slate-700 dark:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 ${triggerRingClass} ${
          isOpen ? 'border-amber-500 ring-2 ring-amber-500/20 dark:border-amber-500' : ''
        }`}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${badgeClass}`}
            aria-hidden="true"
          >
            <MapPin className="h-3.5 w-3.5" />
          </div>
          <span
            className={`truncate font-medium ${
              selectedDevice
                ? 'text-slate-900 dark:text-slate-100'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {devices.length === 0 ? 'No toilet units available' : selectedLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {selectedDevice && (
            <span
              className={`hidden sm:inline-flex rounded-md px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${badgeClass}`}
            >
              {getFloorCategory(selectedDevice.name || selectedDevice.id).replace(' Building', '')}
            </span>
          )}
          <ChevronDown
            className={`h-4 w-4 text-slate-500 transition-transform duration-200 dark:text-slate-400 ${
              isOpen ? 'rotate-180 text-slate-800 dark:text-slate-200' : ''
            }`}
            aria-hidden="true"
          />
        </div>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleListKeyDown}
          className="absolute left-0 right-0 z-50 mt-1.5 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl backdrop-blur-xl transition-all dark:border-slate-700/90 dark:bg-slate-900/95"
        >
          {/* Top Search Filter */}
          <div className="border-b border-slate-200/80 p-2.5 dark:border-slate-800/80">
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400 dark:text-slate-500"
                aria-hidden="true"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Search floor, restroom, or stall..."
                aria-label="Filter toilet units"
                className="w-full rounded-lg border border-slate-200 bg-slate-50/70 py-1.5 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-amber-500 dark:focus:bg-slate-800"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-2.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {/* Grouped Units List */}
          <div
            ref={listRef}
            tabIndex={-1}
            className="max-h-64 overflow-y-auto p-1.5 overscroll-contain focus:outline-none"
          >
            {groupedDevices.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  No toilet units found
                </p>
                <p className="mt-1">
                  No restrooms match &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              groupedDevices.map(([floor, items]) => (
                <div key={floor} role="group" aria-label={floor} className="mb-2 last:mb-0">
                  <div className="sticky top-0 z-10 flex items-center justify-between rounded-md bg-slate-100/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-600 backdrop-blur-sm dark:bg-slate-800/90 dark:text-slate-400">
                    <span>{floor}</span>
                    <span className="font-mono text-[10px] opacity-75">
                      {items.length} {items.length === 1 ? 'unit' : 'units'}
                    </span>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    {items.map((device) => {
                      const isSelected = device.id === value;
                      const globalIndex = flatVisibleDevices.findIndex(
                        (d) => d.id === device.id,
                      );
                      const isHighlighted = globalIndex === highlightedIndex;
                      const displayName = cleanDeviceName(
                        device.name,
                        device.id,
                      );

                      return (
                        <div
                          key={device.id}
                          role="option"
                          id={`option-${device.id}`}
                          aria-selected={isSelected}
                          onClick={() => handleSelect(device.id)}
                          onMouseEnter={() => setHighlightedIndex(globalIndex)}
                          className={`group flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-sm transition-colors ${
                            isSelected
                              ? activeItemClass
                              : isHighlighted
                                ? `${hoverItemClass} text-slate-900 dark:text-slate-100`
                                : 'text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{displayName}</span>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {isSelected && (
                              <Check
                                className={`h-4 w-4 ${
                                  isAmber
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-primary'
                                }`}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Quick Footer hint */}
          <div className="flex items-center justify-between border-t border-slate-200/80 bg-slate-50/70 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800/80 dark:bg-slate-800/50 dark:text-slate-400">
            <span>{devices.length} total units</span>
            <span className="font-mono text-[10px]">Use ↑↓ to navigate</span>
          </div>
        </div>
      )}
    </div>
  );
}
