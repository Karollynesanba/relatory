"use client"

import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react"
import { Check, ChevronDown, Search, Users } from "lucide-react"
import type { EvolutionGroup } from "@/types/evolution.types"

const GROUPS_PAGE_SIZE = 100

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
}

export function buildEvolutionGroupValue(group: EvolutionGroup) {
  return `${group.instance}::${group.id}`
}

export function normalizeEvolutionGroupId(value: string | null | undefined) {
  const normalized = value?.trim() ?? ""
  const separatorIndex = normalized.indexOf("::")

  return separatorIndex >= 0
    ? normalized.slice(separatorIndex + 2).trim()
    : normalized
}

type EvolutionGroupComboboxProps = {
  groups: EvolutionGroup[]
  value: string
  onChange: (value: string) => void
  emptyLabel?: string
  placeholder?: string
  noResultsLabel?: string
  disabled?: boolean
  dataCy?: string
}

export function EvolutionGroupCombobox({
  groups,
  value,
  onChange,
  emptyLabel = "Selecione um grupo",
  placeholder = "Pesquisar grupo pelo nome...",
  noResultsLabel = "Nenhum grupo encontrado.",
  disabled = false,
  dataCy,
}: EvolutionGroupComboboxProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [visibleLimit, setVisibleLimit] = useState(GROUPS_PAGE_SIZE)
  const deferredSearch = useDeferredValue(search)
  const selectedGroupId = normalizeEvolutionGroupId(value)
  const searchableGroups = useMemo(
    () =>
      groups.map((group) => ({
        group,
        searchValue: normalizeSearchValue(
          `${group.subject} ${group.instance} ${group.id} ${buildEvolutionGroupValue(group)}`
        ),
        exactMatch:
          normalizeSearchValue(group.id) === normalizeSearchValue(deferredSearch) ||
          normalizeSearchValue(buildEvolutionGroupValue(group)) ===
            normalizeSearchValue(deferredSearch)
            ? 0
            : 1,
      })),
    [deferredSearch, groups]
  )

  const selectedGroup = useMemo(
    () =>
      groups.find(
        (group) =>
          buildEvolutionGroupValue(group) === value ||
          group.id === selectedGroupId
      ) ?? null,
    [groups, selectedGroupId, value]
  )

  const filteredGroups = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(deferredSearch)

    if (!normalizedSearch) {
      return groups
    }

    return searchableGroups
      .filter((entry) => entry.searchValue.includes(normalizedSearch))
      .sort((left, right) => {
        if (left.exactMatch !== right.exactMatch) {
          return left.exactMatch - right.exactMatch
        }

        const subjectComparison = left.group.subject.localeCompare(
          right.group.subject,
          "pt-BR"
        )

        if (subjectComparison !== 0) {
          return subjectComparison
        }

        return left.group.instance.localeCompare(right.group.instance, "pt-BR")
      })
      .map((entry) => entry.group)
  }, [deferredSearch, groups, searchableGroups])

  const visibleGroups = filteredGroups.slice(0, visibleLimit)
  const hasMoreGroups = visibleGroups.length < filteredGroups.length
  const selectedLabel = selectedGroup
    ? `[${selectedGroup.instance}] ${selectedGroup.subject}`
    : value
      ? selectedGroupId
      : emptyLabel

  useEffect(() => {
    if (!isOpen) {
      return
    }

    requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [isOpen])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    document
      .getElementById(`${listboxId}-option-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest" })
  }, [activeIndex, isOpen, listboxId])

  function closeCombobox() {
    setIsOpen(false)
    setSearch("")
  }

  function openCombobox() {
    const selectedIndex = selectedGroup
      ? filteredGroups.findIndex(
          (group) =>
            buildEvolutionGroupValue(group) ===
            buildEvolutionGroupValue(selectedGroup)
        )
      : 0
    const nextIndex = Math.max(selectedIndex, 0)

    setActiveIndex(nextIndex)
    setVisibleLimit(
      Math.max(
        GROUPS_PAGE_SIZE,
        Math.ceil((nextIndex + 1) / GROUPS_PAGE_SIZE) * GROUPS_PAGE_SIZE
      )
    )
    setIsOpen(true)
  }

  function selectValue(nextValue: string) {
    onChange(nextValue)
    closeCombobox()
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      const nextIndex = Math.min(activeIndex + 1, filteredGroups.length - 1)
      setActiveIndex(Math.max(nextIndex, 0))
      if (nextIndex >= visibleLimit) {
        setVisibleLimit((current) => current + GROUPS_PAGE_SIZE)
      }
      return
    }

    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === "Home") {
      event.preventDefault()
      setActiveIndex(0)
      return
    }

    if (event.key === "End") {
      event.preventDefault()
      const lastIndex = Math.max(filteredGroups.length - 1, 0)
      setActiveIndex(lastIndex)
      setVisibleLimit(
        Math.max(
          GROUPS_PAGE_SIZE,
          Math.ceil((lastIndex + 1) / GROUPS_PAGE_SIZE) * GROUPS_PAGE_SIZE
        )
      )
      return
    }

    if (event.key === "Enter" && filteredGroups[activeIndex]) {
      event.preventDefault()
      selectValue(buildEvolutionGroupValue(filteredGroups[activeIndex]))
      return
    }

    if (event.key === "Escape") {
      event.preventDefault()
      closeCombobox()
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        disabled={disabled}
        data-cy={dataCy}
        onClick={() => {
          if (isOpen) {
            closeCombobox()
            return
          }

          openCombobox()
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            openCombobox()
          }
          if (event.key === "Escape") {
            setIsOpen(false)
          }
        }}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-700 outline-none transition focus:border-[#C1121F] focus:ring-2 focus:ring-[#C1121F]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen ? (
        <div className="absolute z-50 mt-2 w-full min-w-[min(280px,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl">
          <div className="border-b border-gray-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={searchInputRef}
                type="search"
                role="searchbox"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value)
                  setActiveIndex(0)
                  setVisibleLimit(GROUPS_PAGE_SIZE)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-controls={listboxId}
                aria-activedescendant={
                  filteredGroups[activeIndex]
                    ? `${listboxId}-option-${activeIndex}`
                    : undefined
                }
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#C1121F] focus:ring-2 focus:ring-[#C1121F]/20"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400" aria-live="polite">
              {filteredGroups.length} grupo(s) encontrado(s)
            </p>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Grupos do WhatsApp"
            className="max-h-72 overflow-y-auto overscroll-contain p-2"
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => selectValue("")}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
                !value
                  ? "bg-red-50 text-[#C1121F]"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Users className="h-4 w-4 shrink-0" />
              <span className="flex-1">{emptyLabel}</span>
              {!value ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>

            {visibleGroups.map((group, index) => {
              const optionValue = buildEvolutionGroupValue(group)
              const isSelected =
                value === optionValue ||
                (!value.includes("::") && selectedGroupId === group.id)
              const isActive = index === activeIndex

              return (
                <button
                  key={optionValue}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectValue(optionValue)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? "bg-gray-100" : "hover:bg-gray-50"
                  } ${isSelected ? "text-[#C1121F]" : "text-gray-700"}`}
                >
                  <Users className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {group.subject}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {group.instance} · {group.size} participante(s)
                    </span>
                    <span className="block truncate text-[11px] text-gray-400">
                      {group.id}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : null}
                </button>
              )
            })}

            {filteredGroups.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-600">
                  {noResultsLabel}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Tente pesquisar com outro nome.
                </p>
              </div>
            ) : null}

            {hasMoreGroups ? (
              <button
                type="button"
                onClick={() =>
                  setVisibleLimit((current) => current + GROUPS_PAGE_SIZE)
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Carregar mais {Math.min(
                  GROUPS_PAGE_SIZE,
                  filteredGroups.length - visibleGroups.length
                )} grupos
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
