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
import { Check, ChevronDown, Search, Tag } from "lucide-react"
import type { ClientMetaBrandOption } from "@/types/client.types"

const PAGE_SIZE = 100

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
}

type MetaBrandComboboxProps = {
  brands: ClientMetaBrandOption[]
  value: string
  onChange: (value: string) => void
  emptyLabel?: string
  placeholder?: string
  noResultsLabel?: string
  disabled?: boolean
  dataCy?: string
}

export function MetaBrandCombobox({
  brands,
  value,
  onChange,
  emptyLabel = "Selecione uma marca / BM",
  placeholder = "Pesquisar marca / BM...",
  noResultsLabel = "Nenhuma marca encontrada.",
  disabled = false,
  dataCy,
}: MetaBrandComboboxProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState("")
  const [activeIndex, setActiveIndex] = useState(0)
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const deferredSearch = useDeferredValue(search)

  const selectedBrand = useMemo(
    () => brands.find((brand) => brand.id === value) ?? null,
    [brands, value]
  )

  const searchableBrands = useMemo(
    () =>
      brands.map((brand) => ({
        brand,
        searchValue: normalizeSearchValue(
          `${brand.displayName} ${brand.name} ${brand.adAccountName} ${brand.adAccountId} ${brand.businessName ?? ""}`
        ),
        exactMatch:
          normalizeSearchValue(brand.id) === normalizeSearchValue(deferredSearch) ||
          normalizeSearchValue(brand.displayName) === normalizeSearchValue(deferredSearch)
            ? 0
            : 1,
      })),
    [brands, deferredSearch]
  )

  const filteredBrands = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(deferredSearch)

    if (!normalizedSearch) {
      return brands
    }

    return searchableBrands
      .filter((entry) => entry.searchValue.includes(normalizedSearch))
      .sort((left, right) => {
        if (left.exactMatch !== right.exactMatch) {
          return left.exactMatch - right.exactMatch
        }

        return left.brand.displayName.localeCompare(
          right.brand.displayName,
          "pt-BR"
        )
      })
      .map((entry) => entry.brand)
  }, [brands, deferredSearch, searchableBrands])

  const visibleBrands = filteredBrands.slice(0, visibleLimit)
  const hasMoreBrands = visibleBrands.length < filteredBrands.length

  const selectedLabel = selectedBrand
    ? selectedBrand.displayName
    : value
      ? value
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
    const selectedIndex = selectedBrand
      ? filteredBrands.findIndex((brand) => brand.id === selectedBrand.id)
      : 0

    const nextIndex = Math.max(selectedIndex, 0)

    setActiveIndex(nextIndex)
    setVisibleLimit(
      Math.max(
        PAGE_SIZE,
        Math.ceil((nextIndex + 1) / PAGE_SIZE) * PAGE_SIZE
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
      const nextIndex = Math.min(activeIndex + 1, filteredBrands.length - 1)
      setActiveIndex(Math.max(nextIndex, 0))
      if (nextIndex >= visibleLimit) {
        setVisibleLimit((current) => current + PAGE_SIZE)
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
      const lastIndex = Math.max(filteredBrands.length - 1, 0)
      setActiveIndex(lastIndex)
      setVisibleLimit(
        Math.max(PAGE_SIZE, Math.ceil((lastIndex + 1) / PAGE_SIZE) * PAGE_SIZE)
      )
      return
    }

    if (event.key === "Enter" && filteredBrands[activeIndex]) {
      event.preventDefault()
      selectValue(filteredBrands[activeIndex].id)
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
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-700 outline-none transition focus:border-[#C1121F] focus:ring-2 focus:ring-[#C1121F]/20 disabled:cursor-not-allowed disabled:opacity-60"
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
                  setVisibleLimit(PAGE_SIZE)
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder={placeholder}
                aria-label={placeholder}
                aria-controls={listboxId}
                aria-activedescendant={
                  filteredBrands[activeIndex]
                    ? `${listboxId}-option-${activeIndex}`
                    : undefined
                }
                className="w-full rounded-xl border border-gray-200 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-[#C1121F] focus:ring-2 focus:ring-[#C1121F]/20"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400" aria-live="polite">
              {filteredBrands.length} marca(s) encontrada(s)
            </p>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label="Marcas da META"
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
              <Tag className="h-4 w-4 shrink-0" />
              <span className="flex-1">{emptyLabel}</span>
              {!value ? <Check className="h-4 w-4 shrink-0" /> : null}
            </button>

            {visibleBrands.map((brand, index) => {
              const isSelected = value === brand.id
              const isActive = index === activeIndex

              return (
                <button
                  key={brand.id}
                  id={`${listboxId}-option-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectValue(brand.id)}
                  className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                    isActive ? "bg-gray-100" : "hover:bg-gray-50"
                  } ${isSelected ? "text-[#C1121F]" : "text-gray-700"}`}
                >
                  <Tag className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {brand.displayName}
                    </span>
                    <span className="block truncate text-xs text-gray-400">
                      {brand.adAccountName} · {brand.adAccountId}
                    </span>
                  </span>
                  {isSelected ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : null}
                </button>
              )
            })}

            {filteredBrands.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-600">
                  {noResultsLabel}
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  Tente pesquisar com outro nome.
                </p>
              </div>
            ) : null}

            {hasMoreBrands ? (
              <button
                type="button"
                onClick={() =>
                  setVisibleLimit((current) => current + PAGE_SIZE)
                }
                className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
              >
                Carregar mais{" "}
                {Math.min(PAGE_SIZE, filteredBrands.length - visibleBrands.length)}{" "}
                marcas
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
