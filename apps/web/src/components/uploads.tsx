"use client";
import { useId, useRef, useState } from "react";
import { request, errorMessage } from "@/lib/api";
import type { Asset } from "@/lib/types";
import { adminHelp } from "@/lib/admin-help";
import { FieldHelp, SelectField } from "./fields";
type Upload = {
  key: string;
  file: File;
  status: "ready" | "uploading" | "done" | "failed" | "cancelled";
  error?: string;
  asset?: Asset;
};
export function Uploads({ onAsset }: { onAsset: (a: Asset) => void }) {
  const helpId = useId();
  const [rows, setRows] = useState<Upload[]>([]),
    controllers = useRef(new Map<string, AbortController>()),
    generations = useRef(new Map<string, number>()),
    queue = useRef<Promise<void>>(Promise.resolve());
  const patch = (key: string, update: Partial<Upload>) =>
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...update } : x)));
  const upload = async (row: Upload, generation: number) => {
    if (generations.current.get(row.key) !== generation) return;
    const controller = new AbortController();
    controllers.current.set(row.key, controller);
    patch(row.key, { status: "uploading", error: "" });
    try {
      if (row.file.size > 20_000_000) throw new Error("图片不能超过20MB");
      if (!["image/jpeg", "image/png", "image/webp"].includes(row.file.type))
        throw new Error("仅支持 JPEG、PNG、WebP 图片");
      const form = new FormData();
      form.append("file", row.file);
      const asset = await request<Asset>("/api/admin/v1/assets", {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (generations.current.get(row.key) !== generation) return;
      patch(row.key, { status: "done", asset });
      onAsset(asset);
    } catch (e) {
      if (generations.current.get(row.key) === generation)
        patch(row.key, { status: "failed", error: errorMessage(e) });
    } finally {
      controllers.current.delete(row.key);
    }
  };
  const enqueue = (row: Upload) => {
    const generation = (generations.current.get(row.key) || 0) + 1;
    generations.current.set(row.key, generation);
    patch(row.key, { status: "ready", error: "" });
    const run = () => upload(row, generation);
    queue.current = queue.current.then(run, run);
  };
  const add = (files: File[]) => {
    if (files.length > 10) {
      setRows((r) => [
        ...r,
        {
          key: crypto.randomUUID(),
          file: files[0],
          status: "failed",
          error: "一次最多选择10张，请重新选择",
        },
      ]);
      return;
    }
    const added = files.map((file) => ({
      key: crypto.randomUUID(),
      file,
      status: "ready" as const,
    }));
    setRows((r) => [...r, ...added]);
    added.forEach(enqueue);
  };
  return (
    <div
      className="upload-drop"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        add(Array.from(e.dataTransfer.files));
      }}
    >
      <h3>上传图片资源</h3>
      <FieldHelp id={helpId}>{adminHelp.admin.upload}</FieldHelp>
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        aria-label="上传图片文件"
        aria-describedby={helpId}
        onChange={(e) => {
          add(Array.from(e.target.files || []));
          e.target.value = "";
        }}
      />
      {rows.map((row) => (
        <div key={row.key} className="status-row">
          <span>{row.file.name}</span>
          <span role="status">
            {row.status === "uploading"
              ? "上传中…"
              : row.status === "done"
                ? "上传完成"
                : row.status === "cancelled"
                  ? "已取消"
                  : row.error || "等待上传"}
          </span>
          {row.status === "failed" && (
            <button className="text-link" onClick={() => enqueue(row)}>
              重试 {row.file.name}
            </button>
          )}
          {row.status === "uploading" && (
            <button
              onClick={() => {
                generations.current.set(
                  row.key,
                  (generations.current.get(row.key) || 0) + 1,
                );
                controllers.current.get(row.key)?.abort();
                patch(row.key, { status: "cancelled" });
              }}
            >
              取消上传
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
export function AssetSelector({
  label,
  value,
  onChange,
  assets,
  help,
}: {
  label: string;
  value: string | null;
  onChange: (id: string | null) => void;
  assets: Asset[];
  help?: string;
}) {
  return (
    <SelectField
      label={label}
      help={help}
      value={value || ""}
      onChange={(value) => onChange(value || null)}
    >
      <option value="">未选择图片</option>
      {assets.map((a) => (
        <option key={a.id} value={a.id}>
          {a.originalName} · {a.width}×{a.height}
        </option>
      ))}
    </SelectField>
  );
}
