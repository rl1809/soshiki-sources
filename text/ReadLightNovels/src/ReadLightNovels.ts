import { TextEntry, TextEntryResults, Filter, Listing, TextChapter, TextChapterDetails, TextSource, fetch, Document, createTextEntryResults, createTextEntry, EntryStatus, EntryContentRating, createTextChapter, createTextChapterDetails, createSelectFilter, TextChapterResults, createTextChapterResults, createFilterGroup, ListingType, FilterGroup } from "soshiki-sources"

const BASE_URL = "https://readlightnovels.net"
const AJAX_URL = "https://readlightnovels.net/wp-admin/admin-ajax.php"

export default class ReadLightNovelsSource extends TextSource {
    id = "en_readlightnovels"
    async getListing(listing: Listing, page: number): Promise<TextEntryResults> {
        const url = `${BASE_URL}/${listing.id === 'completed' ? 'completed' : 'latest'}/page/${page}`
        const document = await fetch(url).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.home-truyendecu > a")
        let entries: TextEntry[] = []
        for (const item of items) {
            const id = item.getAttribute("href")
            if (id.match(/id(\d+)\.html$/) !== null) continue
            entries.push(createTextEntry({
                id,
                title: item.getAttribute("title"),
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        document.free()
        return createTextEntryResults({
            page,
            hasMore: items.length > 0,
            results: entries
        })
    }
    async getSearchResults(query: string, page: number, filters: Filter[]): Promise<TextEntryResults> {
        let url = BASE_URL
        if (filters[0] && filters[0].value) url += `/${(filters[0].value as string).toLowerCase().replace(" ", "-")}`
        url += `/page/${page}?s=${encodeURIComponent(query)}`
        const document = await fetch(url).then(res => Document.parse(res.data))
        const items = document.querySelectorAll("div.home-truyendecu > a")
        let entries: TextEntry[] = []
        for (const item of items) {
            const id = item.getAttribute("href")
            if (id.match(/id(\d+)\.html$/) !== null) continue
            entries.push(createTextEntry({
                id,
                title: item.getAttribute("title"),
                cover: item.querySelector("img").getAttribute("src")
            }))
        }
        document.free()
        return createTextEntryResults({
            page,
            hasMore: items.length > 0,
            results: entries
        })
    }
    async getEntry(id: string): Promise<TextEntry> {
        const document = await fetch(id, {
            headers: {
                "Referer": "https://readlightnovels.net/"
            }
        }).then(res => Document.parse(res.data))
        const info = document.querySelectorAll("div.info > div")
        const entry = createTextEntry({
            id,
            title: document.querySelector("h3.title").innerText,
            author: info[0].querySelector("a").innerText,
            tags: info[1].querySelectorAll("a").map(el => el.innerText),
            cover: document.querySelector("div.book > img").getAttribute("src"),
            contentRating: EntryContentRating.safe,
            status: info[2].querySelector("a").innerText === 'On Going' ? EntryStatus.ongoing : EntryStatus.completed,
            links: [ id ],
            synopsis: document.querySelector("div.desc-text").innerText
        })
        document.free()
        return entry
    }
    async getChapters(id: string, page: number): Promise<TextChapterResults> {
        let chapters: TextChapter[] = []
        const doc = await fetch(id).then(res => Document.parse(res.data))
        const ajaxId = doc.querySelector("input#id_post").getAttribute("value")
        const total = parseInt(doc.querySelector("input[name=\"total-page\"]").getAttribute("value"))
        doc.free()
        const document = await fetch(AJAX_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: `action=tw_ajax&type=pagination&id=${ajaxId}&page=${total - page + 1}`
        }).then(res => Document.parse(JSON.parse(res.data).list_chap)).catch(() => null)
        if (document !== null) {
            chapters = document.querySelectorAll("ul.list-chapter > li > a").map(el => createTextChapter({
                id: el.getAttribute("href"),
                entryId: id,
                chapter: parseFloat(el.getAttribute("title").match(/Chapter (\d+).*/)?.[1] ?? "0"),
                volume: isNaN(parseFloat(el.getAttribute("title").match(/Volume (\d+).*/)?.[1] ?? "")) ? undefined : parseFloat(el.getAttribute("title").match(/Volume (\d+).*/)?.[1] ?? ""),
                name: el.innerText.match(/(?:Volume \d+ )?(?:Chapter \d+(?: - )?)?([^-]*)/)?.[1].split(' ').map(str=> str.charAt(0).toUpperCase() + str.substring(1)).join(' ') ?? undefined
            }))
            document.free()
        }
        return createTextChapterResults({
            page,
            hasMore: total - page > 0,
            results: chapters.reverse()
        })
    }
    async getChapterDetails(id: string, entryId: string): Promise<TextChapterDetails> {
        const document = await fetch(id).then(res => Document.parse(res.data))
        const html = document.querySelector("div.chapter-content").innerHTML
        document.free()
        return createTextChapterDetails({
            id,
            entryId,
            html
        })
    }
    async getFilters(): Promise<FilterGroup[]> {
        const document = await fetch(BASE_URL).then(res => Document.parse(res.data))
        const genres = document.querySelectorAll("ul.navbar-nav > li")[1].querySelectorAll("div > ul > li > a").map(el => ({
            id: el.title,
            name: el.title,
            selected: false
        }))
        document.free()
        return [
            createFilterGroup({
                filters: [
                    createSelectFilter({
                        id: "genre",
                        name: "Genre",
                        value: genres
                    })
                ]
            })
        ]
    }
    async getListings(): Promise<Listing[]> {
        return [
            {
                id: 'latest',
                name: 'Latest',
                type: ListingType.basic
            },
            {
                id: 'completed',
                name: 'Completed',
                type: ListingType.basic
            }
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return []
    }
    
}