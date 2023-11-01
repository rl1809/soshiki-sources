import { ImageEntry, ImageChapter, ImageChapterDetails, EntryContentRating, EntryStatus, ImageSource, ImageEntryResults, fetch, FetchOptions, Listing, createListing, createImageEntryResults, ListingType, ImageChapterResults, createImageChapterResults, createImageEntry } from "soshiki-sources" 
import { AscendableSortFilter, createAscendableSortFilter, createExcludableMultiSelectFilter, createFilterGroup, createMultiSelectFilter, createNumberFilter, createSegmentFilter, createSelectFilter, createTextFilter, createToggleFilter, ExcludableMultiSelectFilter, Filter, FilterGroup, MultiSelectFilter, SegmentFilter } from "soshiki-sources/dist/filter"

const API_URL = "https://api.mangadex.org"
const COVER_URL = "https://uploads.mangadex.org/covers"
const SITE_URL = "https://mangadex.org"

const MANGA_PER_PAGE = 30

function getStatus(status: string): EntryStatus {
    switch (status) {
        case "completed": return EntryStatus.completed
        case "ongoing": return EntryStatus.ongoing
        case "cancelled": return EntryStatus.cancelled
        case "hiatus": return EntryStatus.hiatus
        default: return EntryStatus.unknown
    }
}

function getContentRating(rating: string): EntryContentRating {
    switch (rating) {
        case "safe": return EntryContentRating.safe
        case "suggestive": return EntryContentRating.suggestive
        default: return EntryContentRating.nsfw
    }
}

export default class Source extends ImageSource {
    id = "multi_mangadex"
    async getListing(listing: Listing, page: number): Promise<ImageEntryResults> {
        const offset = (page - 1) * MANGA_PER_PAGE

        const res = await fetch(`${API_URL}/manga?order[${listing.id === 'latest' ? 'latestUploadedChapter' : 'followedCount'}]=desc&includes[]=cover_art&includes[]=author&includes[]=artist&limit=${MANGA_PER_PAGE}&offset=${offset}`).then(res => JSON.parse(res.data))

        const coverQuality = this.getSettingsValue("coverQuality")

        return createImageEntryResults({
            page: page,
            hasMore: offset + MANGA_PER_PAGE < res.total,
            results: res.data.map((entry: any) => createImageEntry({
                id: entry.id,
                title: entry.attributes.title.en ?? entry.attributes.title[Object.keys(entry.attributes.title)[0]] ?? "",
                cover: `${COVER_URL}/${entry.id}/${entry.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`,
                tags: entry.attributes.tags.map((tag: any) => tag.attributes.name.en),
                synopsis: entry.attributes.description.en,
                status: getStatus(entry.attributes.status),
                author: entry.relationships.find((relationship: any) => relationship.type === "author")?.attributes.name,
                artist: entry.relationships.find((relationship: any) => relationship.type === "artist")?.attributes.name,
                chapters: isNaN(parseFloat(entry.attributes.lastChapter)) ? undefined : parseFloat(entry.attributes.lastChapter)
            }))
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<ImageEntryResults> {
        const offset = (page - 1) * MANGA_PER_PAGE

        let url = `${API_URL}/manga?title=${encodeURIComponent(query)}&includes[]=cover_art&includes[]=author&includes[]=artist&limit=${MANGA_PER_PAGE}&offset=${offset}`

        for (const filter of filters) {
            switch (filter.id) {
                case 'hasAvailableChapters': url += '&hasAvailableChapters=true'; break
                case 'originalLanguage':
                    for (const language of (filter as ExcludableMultiSelectFilter).value.filter(filter => filter.selected)) {
                        switch (language.id) {
                            case 'japanese': url += `&${language.excluded ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=ja`; break
                            case 'korean': url += `&${language.excluded ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=ko`; break
                            case 'chinese': url += `&${language.excluded ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=zh&${language.excluded ? 'excludedOriginalLanguage' : 'originalLanguage'}[]=zh-hk`; break
                        }
                    }
                    break
                case 'demographic': for (const demographic of (filter as MultiSelectFilter).value.filter(filter => filter.selected)) url += `&publicationDemographic[]=${demographic.id}`; break
                case 'contentRating': for (const rating of (filter as MultiSelectFilter).value.filter(filter => filter.selected)) url += `&contentRating[]=${rating.id}`; break
                case 'status': for (const status of (filter as MultiSelectFilter).value.filter(filter => filter.selected)) url += `&status[]=${status.id}`; break
                case 'sort': 
                    const sort = (filter as AscendableSortFilter).value.find(filter => filter.selected)
                    if (typeof sort === 'undefined') break
                    switch (sort.id) {
                        case 'latest_chapter': url += `&order[latestUploadedChapter]=${sort.ascending ? 'asc' : 'desc'}`; break
                        case 'relevance': url += `&order[relevance]=${sort.ascending ? 'asc' : 'desc'}`; break
                        case 'follows': url += `&order[followedCount]=${sort.ascending ? 'asc' : 'desc'}`; break
                        case 'created_date': url += `&order[createdAt]=${sort.ascending ? 'asc' : 'desc'}`; break
                        case 'latest_chapter': url += `&order[updatedAt]=${sort.ascending ? 'asc' : 'desc'}`; break
                        case 'title': url += `&order[title]=${sort.ascending ? 'asc' : 'desc'}`; break
                    }
                    break
                case 'includedTagsMode': url += `&includedTagsMode=${(filter as SegmentFilter).value.find(filter => filter.selected)?.name}`; break
                case 'excludedTagsMode': url += `&excludedTagsMode=${(filter as SegmentFilter).value.find(filter => filter.selected)?.name}`; break
                case 'contents': for (const content of (filter as ExcludableMultiSelectFilter).value.filter(filter => filter.selected)) url += `&${content.excluded ? 'excluded' : 'included'}Tags[]=${content.id}`; break
                case 'formats': for (const content of (filter as ExcludableMultiSelectFilter).value.filter(filter => filter.selected)) url += `&${content.excluded ? 'excluded' : 'included'}Tags[]=${content.id}`; break
                case 'genres': for (const content of (filter as ExcludableMultiSelectFilter).value.filter(filter => filter.selected)) url += `&${content.excluded ? 'excluded' : 'included'}Tags[]=${content.id}`; break
                case 'themes': for (const content of (filter as ExcludableMultiSelectFilter).value.filter(filter => filter.selected)) url += `&${content.excluded ? 'excluded' : 'included'}Tags[]=${content.id}`; break
            }
        }

        const res = await fetch(url).then(res => JSON.parse(res.data))

        const coverQuality = this.getSettingsValue("coverQuality")

        return createImageEntryResults({
            page: page,
            hasMore: offset + MANGA_PER_PAGE < res.total,
            results: res.data.map((entry: any) => createImageEntry({
                id: entry.id,
                title: entry.attributes.title.en ?? entry.attributes.title[Object.keys(entry.attributes.title)[0]] ?? "",
                cover: `${COVER_URL}/${entry.id}/${entry.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`,
                tags: entry.attributes.tags.map((tag: any) => tag.attributes.name.en),
                synopsis: entry.attributes.description.en,
                status: getStatus(entry.attributes.status),
                author: entry.relationships.find((relationship: any) => relationship.type === "author")?.attributes.name,
                artist: entry.relationships.find((relationship: any) => relationship.type === "artist")?.attributes.name,
                chapters: isNaN(parseFloat(entry.attributes.lastChapter)) ? undefined : parseFloat(entry.attributes.lastChapter)
            }))
        })
    }
    async getEntry(id: string): Promise<ImageEntry> {
        const res = await fetch(`${API_URL}/manga/${id}?includes[]=cover_art&includes[]=author&includes[]=artist`).then(res => JSON.parse(res.data).data)

        const coverQuality = this.getSettingsValue("coverQuality")
    
        return createImageEntry({
            id: id,
            title: res.attributes.title.en ?? res.attributes.title[Object.keys(res.attributes.title)[0]] ?? "",
            tags: res.attributes.tags.map((tag: any) => tag.attributes.name.en ?? tag.attributes.name[Object.keys(tag.attributes.name)[0]] ?? ""),
            cover: `${COVER_URL}/${id}/${res.relationships.filter((relationship: any) => relationship.type === "cover_art").map((relationship: any) => relationship.attributes.fileName)[0]}${coverQuality === 'Medium' ? '.512.jpg' : coverQuality === 'Low' ? '.256.jpg' : ''}`,
            contentRating: getContentRating(res.attributes.contentRating as string),
            status: getStatus(res.attributes.status),
            synopsis: res.attributes.description.en ?? res.attributes.description[Object.keys(res.attributes.description)[0]] ?? "",
            links: [ `${SITE_URL}/title/${id}` ],
            author: res.relationships.find((relationship: any) => relationship.type === "author")?.attributes.name,
            artist: res.relationships.find((relationship: any) => relationship.type === "artist")?.attributes.name
        })
    }
    async getChapters(id: string, page: number): Promise<ImageChapterResults> {
        let chapters: ImageChapter[] = []
        let offset = (page - 1) * 500
        let url = `${API_URL}/manga/${id}/feed?includeExternalUrl=0&order[volume]=desc&order[chapter]=desc&translatedLanguage[]=en&includes[]=scanlation_group&limit=500&offset=${offset}`

        const blockedGroups = this.getSettingsValue("blockedScanlators")
        if (blockedGroups) for (const group of blockedGroups.split(",")) url += `&excludedGroups[]=${group.trim()}`
        const blockedUploaders = this.getSettingsValue("blockedScanlators")
        if (blockedUploaders) for (const group of blockedUploaders.split(",")) url += `&excludedUploaders[]=${group.trim()}`

        const res = await fetch(url).then(res => JSON.parse(res.data))
        for (const chapter of res.data) {
            chapters.push({
                id: chapter.id,
                entryId: id,
                name: chapter.attributes.title,
                chapter: parseFloat(chapter.attributes.chapter),
                volume: parseFloat(chapter.attributes.volume),
                translator: chapter.relationships.filter((relationship: any) => relationship.type === 'scanlation_group').map((relationship: any) => relationship.attributes.name)[0]
            })
        }
        return createImageChapterResults({
            page,
            hasMore: offset + 500 <= res.total,
            results: chapters
        })
    }
    async getChapterDetails(id: string, entryId: string): Promise<ImageChapterDetails> {
        const res = await fetch(`https://api.mangadex.org/at-home/server/${id}`).then(res => JSON.parse(res.data))

        const dataSaver = this.getSettingsValue("dataSaver") as boolean

        return {
            id,
            entryId,
            pages: res.chapter[dataSaver ? "dataSaver" : "data"].map((page: string, index: number) => { return {
                index,
                url: `${res.baseUrl}/${dataSaver ? "data-saver" : "data"}/${res.chapter.hash}/${page}`
            }})
        }
    }
    async getFilters(): Promise<FilterGroup[]> {
        const tags = await fetch("https://api.mangadex.org/manga/tag").then(res => JSON.parse(res.data).data)

        return [
            createFilterGroup({
                header: "General",
                filters: [
                    createToggleFilter({
                        id: "hasAvailableChapters",
                        value: true,
                        name: "Has Available Chapters"
                    }),
                    createExcludableMultiSelectFilter({
                        id: "originalLanguage",
                        value: ["Japanese (Manga)", "Korean (Manhwa)", "Chinese (Manhua)"].map(name => ({
                            id: name.split(" ")[0].toLowerCase(),
                            name,
                            selected: false,
                            excluded: false
                        })),
                        name: "Original Language",
                    }),
                    createMultiSelectFilter({
                        id: "demographic",
                        value: ["None", "Shounen", "Shoujo", "Seinen", "Josei"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: false
                        })),
                        name: "Demographic"
                    }),
                    createMultiSelectFilter({
                        id: "contentRating",
                        value: ["Safe", "Suggestive", "Erotica", "Pornographic"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: name === "Safe" || name === "Suggestive"
                        })),
                        name: "Content Rating",
                    }),
                    createMultiSelectFilter({
                        id: "status",
                        value: ["Ongoing", "Completed", "Hiatus", "Cancelled"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: false
                        })),
                        name: "Status",
                    }),
                    createAscendableSortFilter({
                        id: "sort",
                        value: ["Latest Chapter", "Relevance", "Follows", "Created Date", "Last Updated", "Title"].map(name => ({
                            id: name.toLowerCase().replace(" ", "_"),
                            name,
                            selected: name === "Latest Chapter",
                            ascending: false
                        })),
                        name: "Sort"
                    }),
                ]
            }),
            createFilterGroup({
                header: "Tags",
                filters: [
                    createSegmentFilter({
                        id: "includedTagsMode",
                        value: ["AND", "OR"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: name === "AND"
                        })),
                        name: "Included Tags Mode",
                    }),
                    createSegmentFilter({
                        id: "excludedTagsMode",
                        value: ["AND", "OR"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: name === "OR"
                        })),
                        name: "Excluded Tags Mode",
                    }),
                    createExcludableMultiSelectFilter({
                        id: "contents",
                        value: tags.filter((tag: any) => tag.attributes.group === 'content').map((tag: any) => ({
                            id: tag.id,
                            name: tag.attributes.name.en,
                            selected: false,
                            excluded: false
                        })),
                        name: "Contents",
                    }),
                    createExcludableMultiSelectFilter({
                        id: "formats",
                        value: tags.filter((tag: any) => tag.attributes.group === 'format').map((tag: any) => ({
                            id: tag.id,
                            name: tag.attributes.name.en,
                            selected: false,
                            excluded: false
                        })),
                        name: "Formats",
                    }),
                    createExcludableMultiSelectFilter({
                        id: "genres",
                        value: tags.filter((tag: any) => tag.attributes.group === 'genre').map((tag: any) => ({
                            id: tag.id,
                            name: tag.attributes.name.en,
                            selected: false,
                            excluded: false
                        })),
                        name: "Genres",
                    }),
                    createExcludableMultiSelectFilter({
                        id: "themes",
                        value: tags.filter((tag: any) => tag.attributes.group === 'theme').map((tag: any) => ({
                            id: tag.id,
                            name: tag.attributes.name.en,
                            selected: false,
                            excluded: false
                        })),
                        name: "Themes",
                    })
                ]
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "popular",
                name: "Popular",
                type: ListingType.trending
            }),
            createListing({
                id: "latest",
                name: "Latest",
                type: ListingType.basic
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return [
            createFilterGroup({
                header: "Quality",
                filters: [ 
                    createSegmentFilter({
                        id: "coverQuality",
                        value: ["Original", "Medium", "Low"].map(name => ({
                            id: name.toLowerCase(),
                            name,
                            selected: name === "Medium"
                        })),
                        name: "Cover Quality",
                    }),
                    createToggleFilter({
                        id: "dataSaver",
                        value: false,
                        name: "Data Saver"
                    }),
                ]
            }),
            createFilterGroup({
                header: "Advanced",
                filters: [
                    createTextFilter({
                        id: "blockedScanlators",
                        value: "5fed0576-8b94-4f9a-b6a7-08eecd69800d, 06a9fecb-b608-4f19-b93c-7caab06b7f44, 8d8ecf83-8d42-4f8c-add8-60963f9f28d9, 4f1de6a2-f0c5-4ac5-bce5-02c7dbb67deb, 319c1b10-cbd0-4f55-a46e-c4ee17e65139",
                        name: "Blocked Scanlators"
                    }),
                    createTextFilter({
                        id: "blockedUploaders",
                        value: "",
                        name: "Blocked Uploaders"
                    })
                ]
            })
        ]
    }
    async modifyImageRequest(url: string, options: FetchOptions): Promise<{ url: string; options: FetchOptions }> {
        return {
            url, 
            options: {
                headers: {
                    Origin: "https://mangadex.org/",
                    ...(options.headers ?? {})
                },
                ...options
            }
        }
    }
}