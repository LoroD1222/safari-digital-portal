"use client";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { VideoEmbed } from "@/components/video-embed";

// Featured video + list, as in the design's Training tab.
export function Training({ videos }: { videos: { id: string; title: string; url: string }[] }) {
  const [i, setI] = useState(0);
  const v = videos[i];
  return (
    <div className="flex flex-wrap items-start gap-5">
      <figure className="m-0 flex max-w-[440px] flex-[1_1_300px] flex-col gap-2">
        <VideoEmbed key={v.id} url={v.url} title={v.title} />
        <figcaption className="font-semibold">{v.title}</figcaption>
      </figure>
      <ul className="flex flex-[1_1_240px] flex-col gap-0.5">
        {videos.map((x, n) => (
          <li key={x.id}>
            <button type="button" aria-pressed={n === i} onClick={() => setI(n)}
              className={"flex min-h-11 w-full items-center gap-2.5 rounded-control px-2.5 text-left " + (n === i ? "bg-[#F1F2F4] font-semibold" : "hover:bg-[#F7F8F6]")}>
              <Icon name="play" size={16} className={n === i ? "text-brand" : "text-slate"} />
              <span className="flex-1">{x.title}</span>
            </button>
          </li>
        ))}
        <li className="px-2.5 pt-2 text-xs text-slate">Editing itineraries directly in this portal is coming later.</li>
      </ul>
    </div>
  );
}
