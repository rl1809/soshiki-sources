import {
    createVideoEntry,
    createVideoEntryResults,
    createVideoEpisodeDetails,
    VideoEntry,
    EntryContentRating,
    VideoEntryResults,
    EntryStatus,
    FetchOptions,
    Listing,
    VideoEpisode,
    VideoEpisodeDetails,
    VideoSource,
    Filter,
    Document,
    fetch,
    createMultiSelectFilter,
    createSortFilter,
    MultiSelectFilter,
    SortFilter,
    createListing,
    createVideoEpisode,
    VideoEpisodeType,
    VideoEpisodeUrl,
    createVideoEpisodeProvider,
    VideoEpisodeProvider,
    createSegmentFilter,
    VideoEpisodeResults,
    createVideoEpisodeResults,
    FilterGroup,
    VideoEpisodeUrlSubtitle,
} from "soshiki-sources";
import CryptoJS from "crypto-es";

const BASE_URL = "https://aniwatch.to";
const AJAX_URL = "https://aniwatch.to/ajax/v2/";

export default class Aniwatch extends VideoSource {
    id: string = "en_aniwatch";
    async getListing(
        listing: Listing,
        page: number
    ): Promise<VideoEntryResults> {
        let entries: VideoEntry[] = []
        const document = Document.parse(await fetch(`${BASE_URL}/home`).then(res => res.data))

        if (listing.id === 'popular') {
            const items = document.querySelectorAll(".deslide-item")
            for (const item of items) {
                entries.push(createVideoEntry({
                    id: item.querySelector(".desi-buttons").children[1].getAttribute("href"),
                    title: item.querySelector(".dynamic-name").innerText,
                    cover: item.querySelector(".film-poster-img").getAttribute("data-src")
                }))
            }
        } else if(listing.id === 'trending') {
            const items = document.querySelectorAll("#trending-home > div.swiper-container > div.swiper-wrapper > div.swiper-slide > div.item")
            for (const item of items) {
                entries.push(createVideoEntry({
                    id: item.querySelector(".film-poster").getAttribute("href"),
                    title: item.querySelector(".dynamic-name").innerText,
                    cover: item.querySelector("img").getAttribute("data-src")
                }))
            }
        } else if(listing.id === 'recent') {
            const items = document.querySelectorAll("#main-content > section:nth-child(2) > div.tab-content > div > div.film_list-wrap > div.flw-item")
            for (const item of items) {
                entries.push(createVideoEntry({
                    id: item.querySelector(".film-poster-ahref").getAttribute("href"),
                    title: item.querySelector(".dynamic-name").innerText,
                    cover: item.querySelector("img").getAttribute("data-src")
                }))
            }
        } else {
            const items = document.querySelectorAll("#anime-featured > div > div > div > div:nth-child(4) > div > div.anif-block-ul > ul > li")
            for (const item of items) {
                entries.push(createVideoEntry({
                    id: item.querySelector(".film-name > a").getAttribute("href").replace(/-episode-(\d+)$/, ""),
                    title: item.querySelector(".film-name").innerText.trim(),
                    cover: item.querySelector("img").getAttribute("src")
                }))
            }
        }
        document.free();
        return createVideoEntryResults({
            page,
            results: entries,
            hasMore: entries.length > 0
        })
    }
    async getSearchResults(
        query: string,
        page: number,
        filters: Filter[]
    ): Promise<VideoEntryResults> {
        let url = `${BASE_URL}/search?keyword=${encodeURIComponent(
            query
        )}&page=${page}`;
        const document = Document.parse(
            await fetch(url).then((res) => res.data)
        );
        const items = document.querySelectorAll("div.flw-item");
        let entries: VideoEntry[] = [];
        for (const item of items) {
            const e = createVideoEntry({
                id: item
                    .querySelector("h3.film-name > a")
                    .getAttribute("href")
                    .replace("?ref=search", ""),
                title: item
                    .querySelector("h3.film-name > a")
                    .getAttribute("title")
                    .trim(),
                cover: item.querySelector("img").getAttribute("data-src"),
            });
            entries.push(e);
        }
        document.free();
        return createVideoEntryResults({
            page,
            results: entries,
            hasMore: entries.length > 0,
        });
    }
    parseEntryStatus(status: string): EntryStatus {
        switch (status) {
            case "Currently Airing":
                return EntryStatus.ongoing;
            case "Finished Airing":
                return EntryStatus.completed;
            default:
                return EntryStatus.unknown;
        }
    }
    async getEntry(id: string): Promise<VideoEntry> {
        const document = Document.parse(
            await fetch(`${BASE_URL}${id}`).then(
                (res) => `<html>${res.data}</html>`
            )
        );
        const info = document.querySelector("div.film-name.dynamic-name");
        const types = info.querySelectorAll("p.type");
        const statusList = document.querySelectorAll(".item.item-title");
        let status;
        let genres;
        if (statusList != null) {
            let statusArray = Array.from(statusList);
            let filtered = statusArray.find((el) =>
                el.innerText.includes("Status")
            );
            if (filtered != null) {
                status = filtered.querySelector(".name").innerText;
            }
            let genreFiltered = statusArray.find((el) =>
                el.innerText.includes("Genres")
            );
            if (genreFiltered != null) {
                genres = genreFiltered.querySelectorAll("a");
            }
        }
        const entry = createVideoEntry({
            id,
            title: document
                .querySelector(".film-name.dynamic-name")
                .innerText.trim(),
            tags: genres?.map((e) => e.innerText) ?? [],
            cover: document
                .querySelector(".film-poster-img")
                .getAttribute("src"),
            contentRating: EntryContentRating.safe,
            status: this.parseEntryStatus(status ?? ""),
            links: [ `${BASE_URL}${id}` ],
            synopsis: document
                .querySelector(".item.item-title.w-hide > .text")
                .innerText.trim(),
        });
        document.free();
        return entry;
    }
    async getEpisodes(id: string, page: number): Promise<VideoEpisodeResults> {
        const document = Document.parse(
            await fetch(`${BASE_URL}${id}`).then((res) => res.data)
        );
        const ajaxId = document
            .querySelector("#wrapper")
            .getAttribute("data-id");
        document.free();
        const json = await fetch(`${AJAX_URL}episode/list/${ajaxId}`).then(res => JSON.parse(res.data))
        const document3 = Document.parse(
            `<html><body>${json.html.replaceAll("\\\"", "\"")}</body></html>`
        );
        let episodes: VideoEpisode[] = [];
        for (const episode of document3.querySelectorAll(".ssl-item.ep-item")) {
            const href = episode.getAttribute("href").trim();
            episodes.push(
                createVideoEpisode({
                    id: href.split("?ep=")[1].replace("?ep=", ""),
                    entryId: id,
                    episode: parseFloat(
                        episode.getAttribute("data-number") ?? "0"
                    ),
                    type: VideoEpisodeType.sub,
                    name: episode.getAttribute("title"),
                })
            );
        }
        document3.free();
        return createVideoEpisodeResults({
            page,
            hasMore: false,
            results: episodes.reverse()
        })
    }
    async getEpisodeDetails(
        id: string,
        entryId: string
    ): Promise<VideoEpisodeDetails> {
        const document2 = Document.parse(
            await fetch(
                `${AJAX_URL}episode/servers?episodeId=${id}`
            ).then(res => JSON.parse(res.data).html)
        );

        // servers
        let subServers = document2.querySelector(
            ".ps_-block.ps_-block-sub.servers-sub"
        );
        let dubServers = document2.querySelector(
            ".ps_-block.ps_-block-sub.servers-dub"
        );
        let elements = subServers.querySelectorAll(".server-item");
        let servers = [];
        for (let i = 0; i < elements.length; i++) {
            servers.push({
                url: `${AJAX_URL}episode/sources?id=${elements[i].getAttribute("data-id")}`,
                name: elements[i].innerText + " (Sub)",
            });
        }
        if (dubServers != null) {
            elements = dubServers.querySelectorAll(".server-item");
            for (let i = 0; i < elements.length; i++) {
                servers.push({
                    url: `${AJAX_URL}episode/sources?id=${elements[i].getAttribute("data-id")}`,
                    name: elements[i].innerText + " (Dub)",
                });
            }
        }
        let promises: Promise<VideoEpisodeProvider>[] = [];
        servers.forEach((server) => {
            if (server.name.includes("Vidstreaming")) {
                promises.push(new Promise(async res =>
                        res(createVideoEpisodeProvider({
                            name: server.name,
                            urls: await this.getVidstreaming(server.url),
                        })))
                );
            }
        });
        const providers = await Promise.all(promises)
        document2.free();
        return createVideoEpisodeDetails({
            id,
            entryId,
            providers,
        });
    }

    async getVidstreaming(serverUrl: string): Promise<VideoEpisodeUrl[]> {
        const myJsonObject = await fetch(`${serverUrl}`).then((res) => JSON.parse(res.data))
        const embedId = myJsonObject["link"]
            .replace("https://megacloud.tv/embed-2/e-1/", "")
            .split("?")[0];
        const url = `https://megacloud.tv/embed-2/ajax/e-1/getSources?id=${embedId}`;
        const myJsonObject2 = await fetch(`${url}`).then((res) => JSON.parse(res.data))
        const subtitleTracks = (myJsonObject2.tracks as any[]).filter(track => track.kind === "captions").map(caption => ({
            name: caption.label,
            language: Object.entries(languageMappings).find(code => code[1] === caption.file.split("-")[0].slice(-3))?.[0] ?? "en",
            url: caption.file
        } as VideoEpisodeUrlSubtitle))
        if (myJsonObject2["encrypted"] == true) {
            let base64 = myJsonObject2["sources"] as string;
            let stops = await fetch("https://raw.githubusercontent.com/enimax-anime/key/e6/key.txt").then(res => JSON.parse(res.data))
            let key = ""
            let offset = 0
            for (const stop of stops) {
                key += base64.slice(stop[0] - offset, stop[1] - offset)
                base64 = base64.slice(0, stop[0] - offset) + base64.slice(stop[1] - offset)
                offset += stop[1] - stop[0]
            }
            let decryptedData = JSON.parse(
                CryptoJS.AES.decrypt(base64, key).toString(
                    CryptoJS.enc.Utf8
                )
            );
            let episodes: VideoEpisodeUrl[] = [];
            if (decryptedData[0].type == "hls") {
                decryptedData.forEach((source: any) => {
                    episodes.push({
                        url: source.file,
                        quality: 1080,
                        subtitles: subtitleTracks
                    });
                });
            } else {
                decryptedData.source.forEach((source: any) => {
                    episodes.push({
                        url: source.file,
                        quality: 1080,
                        subtitles: subtitleTracks
                    });
                });
            }
            return episodes;
        } else {
            let episodes: VideoEpisodeUrl[] = [];
            if (myJsonObject2.sources[0].type == "hls") {
                myJsonObject2.sources.forEach((source: any) => {
                    episodes.push({
                        url: source.file,
                        quality: "AUTO",
                        subtitles: subtitleTracks
                    });
                });
            } else {
                myJsonObject2.sources.source.forEach((source: any) => {
                    episodes.push({
                        url: source.file,
                        quality: parseFloat(source.label.split(" ")[0]),
                        subtitles: subtitleTracks
                    });
                });
            }
            return episodes;
        }
    }

    async getFilters(): Promise<FilterGroup[]> {
        return [];
    }
    async getListings(): Promise<Listing[]> {
        return [
            createListing({
                id: "trending",
                name: "Trending",
                type: "TRENDING"
            }),
            createListing({
                id: "popular",
                name: "Popular",
                type: "TOP_RATED"
            }),
            createListing({
                id: "recent",
                name: "Recent",
                type: "BASIC"
            }),
            createListing({
                id: "completed",
                name: "Completed",
                type: "BASIC"
            })
        ]
    }
    async getSettings(): Promise<FilterGroup[]> {
        return []
    }
    async modifyVideoRequest(
        url: string,
        options: FetchOptions
    ): Promise<{ url: string; options: FetchOptions }> {
        return { url, options }
    }
}

const languageMappings = {
    aa: "aar",
    ab: "abk",
    af: "afr",
    ak: "aka",
    sq: "alb",
    am: "amh",
    ar: "ara",
    an: "arg",
    hy: "arm",
    as: "asm",
    av: "ava",
    ae: "ave",
    ay: "aym",
    az: "aze",
    ba: "bak",
    bm: "bam",
    be: "bel",
    bn: "ben",
    bh: "bih",
    bi: "bis",
    bo: "tib",
    bs: "bos",
    br: "bre",
    bg: "bul",
    ca: "cat",
    cs: "cze",
    ch: "cha",
    ce: "che",
    zh: "chi",
    cu: "chu",
    cv: "chv",
    kw: "cor",
    co: "cos",
    cr: "cre",
    cy: "wel",
    da: "dan",
    de: "ger",
    dv: "div",
    nl: "dut",
    dz: "dzo",
    el: "gre",
    en: "eng",
    eo: "epo",
    et: "est",
    eu: "baq",
    ee: "ewe",
    fo: "fao",
    fa: "per",
    fj: "fij",
    fi: "fin",
    fr: "fre",
    fy: "fry",
    ff: "ful",
    ka: "geo",
    gd: "gla",
    ga: "gle",
    gl: "glg",
    gv: "glv",
    gn: "grn",
    gu: "guj",
    ht: "hat",
    ha: "hau",
    he: "heb",
    hz: "her",
    hi: "hin",
    ho: "hmo",
    hr: "hrv",
    hu: "hun",
    ig: "ibo",
    is: "ice",
    io: "ido",
    ii: "iii",
    iu: "iku",
    ie: "ile",
    ia: "ina",
    id: "ind",
    ik: "ipk",
    it: "ita",
    jv: "jav",
    ja: "jpn",
    kl: "kal",
    kn: "kan",
    ks: "kas",
    kr: "kau",
    kk: "kaz",
    km: "khm",
    ki: "kik",
    rw: "kin",
    ky: "kir",
    kv: "kom",
    kg: "kon",
    ko: "kor",
    kj: "kua",
    ku: "kur",
    lo: "lao",
    la: "lat",
    lv: "lav",
    li: "lim",
    ln: "lin",
    lt: "lit",
    lb: "ltz",
    lu: "lub",
    lg: "lug",
    mk: "mac",
    mh: "mah",
    ml: "mal",
    mi: "mao",
    mr: "mar",
    ms: "may",
    mg: "mlg",
    mt: "mlt",
    mn: "mon",
    my: "bur",
    na: "nau",
    nv: "nav",
    nr: "nbl",
    nd: "nde",
    ng: "ndo",
    ne: "nep",
    nn: "nno",
    nb: "nob",
    no: "nor",
    ny: "nya",
    oc: "oci",
    oj: "oji",
    or: "ori",
    om: "orm",
    os: "oss",
    pa: "pan",
    pi: "pli",
    pl: "pol",
    pt: "por",
    ps: "pus",
    qu: "que",
    rm: "roh",
    ro: "rum",
    rn: "run",
    ru: "rus",
    sg: "sag",
    sa: "san",
    si: "sin",
    sk: "slo",
    sl: "slv",
    se: "sme",
    sm: "smo",
    sn: "sna",
    sd: "snd",
    so: "som",
    st: "sot",
    es: "spa",
    sc: "srd",
    sr: "srp",
    ss: "ssw",
    su: "sun",
    sw: "swa",
    sv: "swe",
    ty: "tah",
    ta: "tam",
    tt: "tat",
    te: "tel",
    tg: "tgk",
    tl: "tgl",
    th: "tha",
    ti: "tir",
    to: "ton",
    tn: "tsn",
    ts: "tso",
    tk: "tuk",
    tr: "tur",
    tw: "twi",
    ug: "uig",
    uk: "ukr",
    ur: "urd",
    uz: "uzb",
    ve: "ven",
    vi: "vie",
    vo: "vol",
    wa: "wln",
    wo: "wol",
    xh: "xho",
    yi: "yid",
    yo: "yor",
    za: "zha",
    zu: "zul",
};