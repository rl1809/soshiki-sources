import { ImageEntry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, ImageEntryResults, fetch, FetchOptions, Listing, createImageEntryResults, createImageChapter, createImageChapterDetails, ImageChapterPage, createImageChapterPage, createListing, createImageEntry, ListingType, ImageChapterResults, createImageChapterResults } from "soshiki-sources" 
import { createAscendableSortFilter, createExcludableMultiSelectFilter, createFilterGroup, createSegmentFilter, Filter, FilterGroup } from "soshiki-sources/dist/filter"
import * as fuzzysort from "fuzzysort"

const MS_SITE_URL = "https://mangasee123.com"
const ML_SITE_URL = "https://manga4life.com"
const IMAGE_SERVER_URL = "https://temp.compsci88.com"

type SiteChapter = {
    Chapter: string,
    Type: string,
    Date: string,
    ChapterName: string | null,
    Page?: string,
    Directory?: string
}

type SiteEntry = {
    /** ID */
    i: string,
    /** Title */
    s: string,
    /** Official ("yes" or "no") */
    o: string,
    /** Scan Status */
    ss: string,
    /** Publish Status */
    ps: string,
    /** Type */
    t: string,
    /** Views (all time) */
    v: string,
    /** Views (this month) */
    vm: string,
    /** Year */
    y: string,
    /** Authors */
    a: string[],
    /** Alternative Titles */
    al: string[],
    /** not sure */
    l: string,
    /** Last Updated, in seconds since epoch (probably) */
    lt: number,
    /** Last Updated (probably) */
    ls: string,
    /** Genres */
    g: string[],
    /** Hot (or not :D) */
    h: boolean
}

let directoryUrl = serverUrl()
let directory: SiteEntry[] | undefined

function serverUrl(): string {
    return getSettingsValue("serverUrl", "en_mangasee")?.id === "manga4life" ? ML_SITE_URL : MS_SITE_URL
}

async function fetchDirectory() {
    const html = await fetch(`${serverUrl()}/search/`).then(res => res.data)
    directory = JSON.parse(`[${html.match(/vm\.Directory \= \[(.*?)\];/)?.[1] ?? ''}]`)
    directoryUrl = serverUrl()
}

export default class Source extends ImageSource {
    id = "en_mangasee"
    async getListing(listing: Listing, page: number): Promise<ImageEntryResults> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        return createImageEntryResults({
            page: page,
            hasMore: false,
            results: directory!.sort((entry1, entry2) => {
                switch (listing.id) {
                    case "": return 1
                    case "latestChapter": return (entry2.lt - entry1.lt)
                    case "mostPopular": return (parseInt(entry2.v) - parseInt(entry1.v))
                    case "mostPopularMonthly": return (parseInt(entry2.vm) - parseInt(entry1.vm))
                    default: return 0
                }
            }).map(entry => createImageEntry({
                id: entry.i.toLowerCase(),
                title: entry.s,
                cover: `${IMAGE_SERVER_URL}/cover/${entry.i}.jpg`
            }))
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<ImageEntryResults> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        return createImageEntryResults({
            page: page,
            hasMore: false,
            results: fuzzysort.go(query, directory!, { keys: [ "s", "al" ] }).filter(entry => {
                return filters.every(filter => {
                    switch (filter.id) {
                        case "official": return (filter.value as any[]).find(e => e.selected)?.id === 'any' ? true : entry.obj.o === (filter.value as any[]).find(e => e.selected)?.id
                        case "scanStatus": return (filter.value as any[]).filter(e => e.selected).length === 0 ? true : (filter.value as any[]).filter(e => e.selected && !e.excluded).some(status => entry.obj.ss === status.id) && (filter.value as any[]).filter(e => e.selected && e.excluded).every(status => entry.obj.ss !== status.id)
                        case "publishStatus": return (filter.value as any[]).filter(e => e.selected).length === 0 ? true : ((filter.value as any[]).filter(e => e.selected && !e.excluded).some(status => entry.obj.ps === status.id) && (filter.value as any[]).filter(e => e.selected && e.excluded).every(status => entry.obj.ps !== status.id))
                        case "type": return (filter.value as any[]).filter(e => e.selected).length === 0 ? true : ((filter.value as any[]).filter(e => e.selected && !e.excluded).some(type => entry.obj.t === type.id) && (filter.value as any[]).filter(e => e.selected && e.excluded).every(type => entry.obj.t !== type.id))
                        case "genre": return (filter.value as any[]).filter(e => e.selected).every(genre => entry.obj.g.includes(genre.id) !== genre.excluded)
                        default: return true
                    }
                })
            }).sort((entry1, entry2) => {
                const sort = (filters.find(filter => filter.id === "sort")?.value as any[])?.find(e => e.selected)
                switch (sort) {
                    case "alphabetical": return entry1.obj.s.localeCompare(entry2.obj.s) * (sort.ascending ? -1 : 1)
                    case "latest_chapter": return (entry2.obj.lt - entry1.obj.lt) * (sort.ascending ? -1 : 1)
                    case "year_released": return (parseInt(entry2.obj.y) - parseInt(entry1.obj.y)) * (sort.ascending ? -1 : 1)
                    case "popularity_all_time": return (parseInt(entry2.obj.v) - parseInt(entry1.obj.v)) * (sort.ascending ? -1 : 1)
                    case "popularity_monthly": return (parseInt(entry2.obj.vm) - parseInt(entry1.obj.vm)) * (sort.ascending ? -1 : 1)
                    default: return 0
                }
            }).map(entry => createImageEntry({
                id: entry.obj.i.toLowerCase(),
                title: entry.obj.s,
                cover: `${IMAGE_SERVER_URL}/cover/${entry.obj.i}.jpg`
            }))
        })
    }
    async getEntry(id: string): Promise<ImageEntry> {
        if (typeof directory === 'undefined' || serverUrl() !== directoryUrl) await fetchDirectory()
        const entry = directory!.find(item => item.i.toLowerCase() === id)!
        return createImageEntry({
            id,
            title: entry.s,
            author: entry.a[0],
            tags: entry.g,
            cover: `${IMAGE_SERVER_URL}/cover/${entry.i}.jpg`,
            contentRating: entry.g.includes("Hentai") ? EntryContentRating.nsfw : entry.g.includes("Smut") || entry.g.includes("Ecchi") ? EntryContentRating.suggestive : EntryContentRating.safe,
            status: (() => {
                switch (entry.ps) {
                    case "Cancelled": return EntryStatus.cancelled
                    case "Complete": return EntryStatus.completed
                    case "Discontinued": return EntryStatus.cancelled
                    case "Hiatus": return EntryStatus.hiatus
                    case "Ongoing": return EntryStatus.ongoing
                    default: return EntryStatus.unknown
                }
            })(),
            links: [ `${serverUrl()}/manga/${id}` ]
        })
    }
    async getChapters(id: string, page: number): Promise<ImageChapterResults> {
        const html = await fetch(`${serverUrl()}/manga/${id}`).then(res => res.data)
        const chapters: SiteChapter[] = JSON.parse(`[${html.match(/vm\.Chapters \= \[(.*?)\];/)?.[1] ?? ''}]`)
        return createImageChapterResults({
            page: page,
            hasMore: false,
            results: chapters.map(chapter => createImageChapter({
                id: `${id}-chapter-${parseInt(chapter.Chapter.substring(1, 5)) + parseInt(chapter.Chapter.substring(5, 6)) / 10}${chapter.Chapter.substring(0, 1) === "1" ? "" : `-index-${chapter.Chapter.substring(0, 1)}`}-page-1.html`,
                entryId: id,
                chapter: parseInt(chapter.Chapter.substring(1, 5)) + parseInt(chapter.Chapter.substring(5, 6)) / 10,
                name: chapter.ChapterName ?? undefined
            }))
        })
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const html = await fetch(`${serverUrl()}/read-online/${id}`).then(res => res.data)
        const chapter: Required<SiteChapter> = JSON.parse(`{${html.match(/vm\.CurChapter \= \{(.*?)\};/)?.[1] ?? ''}}`)
        const parsedId = html.match(/<a href="\/manga\/(.*?)" class="btn btn-sm btn-outline-secondary">/)?.[1] ?? entryId
        const baseUrl = `https://${html.match(/vm\.CurPathName \= \"(.*?)\";/)?.[1] ?? ''}`
        let pages: ImageChapterPage[] = []
        for (let page = 1; page <= parseInt(chapter.Page); ++page) {
            pages.push(createImageChapterPage({
                url: `${baseUrl}/manga/${parsedId}/${chapter.Chapter.substring(1, 5)}-${`000${page}`.substring(`000${page}`.length - 3)}.png`
            }))
        }
        return createImageChapterDetails({
            id,
            entryId,
            pages
        })
    }
    async getFilters(): Promise<FilterGroup[]> {
        return [
            createFilterGroup({
                header: "Sort",
                filters: [
                    createAscendableSortFilter({
                        id: "sort",
                        name: "Sort",
                        value: [
                            "Alphabetical",
                            "Latest Chapter",
                            "Year Released",
                            "Popularity (All Time)",
                            "Popularity (Monthly)"
                        ].map(e => ({ id: e.toLowerCase().replaceAll("(", "").replaceAll(")", ""), name: e, selected: false, ascending: false }))
                    })
                ]
            }),
            createFilterGroup({
                header: "Status",
                filters: [
                    createSegmentFilter({
                        id: "official",
                        name: "Official Translation",
                        value: ["Any", "Yes", "No"].map(e => ({ id: e.toLowerCase(), name: e, selected: false, excluded: false }))
                    }),
                    createExcludableMultiSelectFilter({
                        id: "scanStatus",
                        name: "Scan Status",
                        value: [
                            "Cancelled",
                            "Completed",
                            "Discontinued",
                            "Hiatus",
                            "Ongoing"
                        ].map(e => ({ id: e, name: e, selected: false, excluded: false }))
                    }),
                    createExcludableMultiSelectFilter({
                        id: "publishStatus",
                        name: "Publishing Status",
                        value: [
                            "Cancelled",
                            "Completed",
                            "Discontinued",
                            "Hiatus",
                            "Ongoing"
                        ].map(e => ({ id: e, name: e, selected: false, excluded: false }))
                    })
                ]
            }),
            createFilterGroup({
                header: "Genre",
                filters: [      
                    createExcludableMultiSelectFilter({
                        id: "type",
                        name: "Type",
                        value: [
                            "Doujinshi",
                            "Manga",
                            "Manhua",
                            "Manhwa",
                            "OEL",
                            "One-shot"
                        ].map(e => ({ id: e, name: e, selected: false, excluded: false }))
                    }),
                    createExcludableMultiSelectFilter({
                        id: "genre",
                        name: "Genre",
                        value: [
                            "Action",
                            "Adult",
                            "Adventure",
                            "Comedy",
                            "Doujinshi",
                            "Drama",
                            "Ecchi",
                            "Fantasy",
                            "Gender Bender",
                            "Harem",
                            "Hentai",
                            "Historical",
                            "Horror",
                            "Isekai",
                            "Josei",
                            "Lolicon",
                            "Martial Arts",
                            "Martial Arts Shounen",
                            "Mature",
                            "Mecha",
                            "Mystery",
                            "Psychological",
                            "Psychological Romance",
                            "Romance",
                            "School Life",
                            "Sci-fi",
                            "Seinen",
                            "Shotacon",
                            "Shoujo",
                            "Shoujo Ai",
                            "Shounen",
                            "Shounen Ai",
                            "Shounen Ai Slice of Life",
                            "Slice of Life",
                            "Slice of Life Supernatural",
                            "Smut",
                            "Sports",
                            "Supernatural",
                            "Tragedy",
                            "Yaoi",
                            "Yuri"
                        ].map(e => ({ id: e, name: e, selected: false, excluded: false }))
                    })
                ]
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "latestChapter",
                name: "Latest Chapter",
                type: ListingType.trending
            }),
            createListing({
                id: "mostPopular",
                name: "Most Popular (All Time)",
                type: ListingType.topRated
            }),
            createListing({
                id: "mostPopularMonthly",
                name: "Most Popular (Monthly)",
                type: ListingType.topRated
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return [
            createFilterGroup({
                header: "General",
                filters: [
                    createSegmentFilter({
                        id: "serverUrl",
                        value: [
                            { id: "mangasee", name: "MangaSee123", selected: true },
                            { id: "manga4life", name: "Manga4Life", selected: false }
                        ],
                        name: "Server"
                    })
                ]
            })
        ]
    }
    async modifyImageRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        return { url, options }
    }
}