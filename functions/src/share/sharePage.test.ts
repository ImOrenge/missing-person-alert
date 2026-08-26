import {buildActiveShareHtml, buildUnavailableShareHtml, SHARE_FALLBACK_IMAGE} from "./sharePage";

const active = buildActiveShareHtml({
  id: "case-1",
  name: "김<script>alert(1)</script>",
  type: "dementia",
  photo: "javascript:alert(1)",
  location: {address: "서울특별시 강서구 상세주소 123"},
});

if (!active.includes("/share/case-1") || !active.includes("/missing/case-1")) throw new Error("share and canonical URLs are required");
if (!active.includes("noindex,follow,noarchive")) throw new Error("share page must avoid duplicate indexing");
if (!active.includes("서울특별시 강서구에서")) throw new Error("share description must use only a broad region");
if (active.includes("상세주소") || active.includes("<script>alert")) throw new Error("exact address and HTML injection must not be emitted");
if (!active.includes("&lt;script&gt;alert(1)&lt;/script&gt;")) throw new Error("case fields must be escaped");
if (!active.includes(SHARE_FALLBACK_IMAGE) || active.includes("javascript:alert")) throw new Error("unsafe image URLs must fall back");

const unavailable = buildUnavailableShareHtml();
if (!unavailable.includes("noindex,nofollow,noarchive") || unavailable.includes("case-1")) throw new Error("unavailable page must be generic");

console.log("share page HTML contract passed");
