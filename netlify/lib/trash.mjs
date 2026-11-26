export const TRASH_DAYS = 100;

// 找出垃圾桶里该清掉的东西（纯计算，方便测试）
export function planPurge(records, now = Date.now()) {
  const cutoff = now - TRASH_DAYS * 86400000;
  const old = (iso) => iso && new Date(iso).getTime() < cutoff;
  const deleteRecords = [];
  const trimFiles = [];
  for (const r of records) {
    if (old(r.deleted_at)) {
      const paths = [...(r.files || []), ...(r.trash_files || []), ...(r.history || []).flatMap((h) => h.files || [])].map((f) => f.path).filter(Boolean);
      deleteRecords.push({ id: r.id, paths });
      continue;
    }
    const tf = r.trash_files || [];
    const keep = tf.filter((f) => !old(f.removed_at));
    if (keep.length !== tf.length) {
      trimFiles.push({ id: r.id, keep, paths: tf.filter((f) => old(f.removed_at)).map((f) => f.path).filter(Boolean) });
    }
  }
  return { deleteRecords, trimFiles };
}

