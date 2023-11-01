import { ImageEntry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, ImageEntryResults, fetch, FetchOptions, Listing, createListing, createImageEntryResults, Document, createImageEntry, createImageChapter, createImageChapterPage, ImageChapterResults, createImageChapterResults, ListingType } from "soshiki-sources" 
import { createExcludableMultiSelectFilter, createFilterGroup, createSegmentFilter, createSortFilter, createTextFilter, createToggleFilter, Filter, FilterGroup } from "soshiki-sources/dist/filter"

const BASE_URL = "https://manganato.com"

export default class Source extends ImageSource {
    id = "en_manganato"
    async getListing(listing: Listing, page: number): Promise<ImageEntryResults> {
        const document = await fetch(`${BASE_URL}/genre-all/${page}${listing.id === "" || listing.id === "latest" ? "" : `?type=${listing.id}`}`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.content-genres-item > a")
        let entries: ImageEntry[] = []
        for (const item of items) {
            entries.push(createImageEntry({
                id: item.getAttribute("href"),
                title: item.title,
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        const hasMore = parseInt(document.querySelector("a.page-last").innerText.match(/LAST\((\d+)\)/)?.[1] ?? "1") <= page
        document.free()
        return createImageEntryResults({
            page,
            hasMore,
            results: entries
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<ImageEntryResults> {
        let queryItems: string[] = [`page=${page}`, `keyw=${query.replace(/[\W_]+/g, "_").toLowerCase()}`]
        for (const filter of filters) {
            switch (filter.id) {
                case "status": queryItems.push((filter.value as any[]).find(v => v.selected)?.id ?? ""); break
                case "sort": queryItems.push((filter.value as any[]).find(v => v.selected)?.id ?? ""); break
                case "genres":
                    if ((filter.value as any[]).filter(genre => genre.selected === true && genre.excluded === false).length > 0) queryItems.push(`g_i=_${(filter.value as any[]).filter(genre => genre.selected === true && genre.excluded === false).map(item => item.id).join("_")}_`)
                    if ((filter.value as any[]).filter(genre => genre.selected === true && genre.excluded === true).length > 0) queryItems.push(`g_e=_${(filter.value as any[]).filter(genre => genre.selected === true && genre.excluded === true).map(item => item.id).join("_")}_`)
                    break
            }
        }
        const document = await fetch(`${BASE_URL}/advanced_search?${queryItems.filter(s => s !== "").join("&")}`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.content-genres-item > a")
        let entries: ImageEntry[] = []
        for (const item of items) {
            entries.push(createImageEntry({
                id: item.getAttribute("href"),
                title: item.title,
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        const hasMore = parseInt(document.querySelector("a.page-last").innerText.match(/LAST\((\d+)\)/)?.[1] ?? "1") <= page
        document.free()
        return createImageEntryResults({
            page,
            hasMore,
            results: entries
        })
    }
    async getEntry(id: string): Promise<ImageEntry> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const data = document.querySelector("div.panel-story-info")
        const image = data.querySelector("span.info-image > img")
        const infoTable = data.querySelectorAll("tbody > tr")
        const tags = infoTable[3].querySelectorAll("td.table-value > a").map(item => item.innerText.trim())
        const statusText = infoTable[2].querySelector("td.table-value").innerText
        const entry = createImageEntry({
            id,
            title: image.title,
            author: infoTable[1].querySelector("td.table-value > a").innerText.trim(),
            tags,
            cover: image.getAttribute("src"),
            contentRating: tags.includes("Smut") || tags.includes("Pornographic") ? EntryContentRating.nsfw : tags.includes("Adult") || tags.includes("Ecchi") || tags.includes("Mature") || tags.includes("Erotica") ? EntryContentRating.suggestive : EntryContentRating.safe,
            status: statusText === "Completed" ? EntryStatus.completed : statusText === "Ongoing" ? EntryStatus.ongoing : EntryStatus.unknown,
            links: [ id ],
            synopsis: document.querySelector("div.panel-story-info-description").innerText.substring("Description :".length).trim()
        })
        document.free()
        return entry
    }
    async getChapters(id: string, page: number): Promise<ImageChapterResults> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("ul.row-content-chapter > li > a")
        let chapters: ImageChapter[] = []
        for (const item of items) {
            chapters.push(createImageChapter({
                id: item.getAttribute("href"),
                entryId: id,
                chapter: parseFloat(item.getAttribute("href").match(/chapter-([0-9.]+)/)?.[1] ?? "0"),
                name: item.innerText.match(/Chapter [0-9.]+: (.*)/)?.[1] ?? undefined
            }))
        }
        document.free()
        return createImageChapterResults({
            page: page,
            hasMore: false,
            results: chapters
        })
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const pages = document.querySelectorAll("div.container-chapter-reader > img").map(item => createImageChapterPage({
            url: item.getAttribute("src")
        }))
        document.free()
        return {
            id,
            entryId,
            pages
        }
    }
    async getFilters(): Promise<FilterGroup[]> {
        const document = await fetch(`${BASE_URL}/advanced-search`).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("span.advanced-search-tool-genres-item")
        let tags = []
        for (const item of items) {
            tags.push({
                id: item.getAttribute("data-i"),
                name: item.innerText.trim(),
                selected: false,
                excluded: false
            })
        }
        document.free()
        return [
            createFilterGroup({
                filters: [
                    createSortFilter({
                        id: "sort",
                        name: "Sort",
                        value: [
                            { id: "", name: "Latest Update", selected: false },
                            { id: "orby=topview", name: "Most Popular", selected: false },
                            { id: "orby=newest", name: "Newest", selected: false },
                            { id: "orby=az", name: "A-Z", selected: false }
                        ]
                    }),
                    createSegmentFilter({
                        id: "status",
                        name: "Status",
                        value: [
                            { id: "", name: "All", selected: true },
                            { id: "sts=ongoing", name: "Ongoing", selected: false },
                            { id: "sts=completed", name: "Completed", selected: false }
                        ]
                    }),
                    createExcludableMultiSelectFilter({
                        id: "genres",
                        value: tags,
                        name: "Genres"
                    })
                ]
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "topview",
                name: "Popular",
                type: ListingType.trending
            }),
            createListing({
                id: "latest",
                name: "Latest",
                type: ListingType.basic
            }),
            createListing({
                id: "newest",
                name: "New",
                type: ListingType.basic
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return []
    }
    async modifyImageRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        return { 
            url, 
            options: {
                headers: {
                    Referer: "https://readmanganato.com",
                    ...(options.headers ?? {})
                },
                ...options
            } 
        }
    }
}