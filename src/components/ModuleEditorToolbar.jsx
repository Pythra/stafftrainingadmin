import { useRef, useState } from "react";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "https://crunches-training.fly.dev";

function selectionIsInsideEditor(editorEl) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !editorEl) return false;
  const node = sel.anchorNode;
  return node && editorEl.contains(node);
}

function insertImageIntoEditor(editorEl, url, alt, savedRange) {
  if (!editorEl || !url) return null;

  const img = document.createElement("img");
  img.src = url;
  img.alt = alt || "";
  img.className = "module-editor-inserted-image";
  img.setAttribute("data-module-image", "true");
  img.referrerPolicy = "no-referrer";

  let range = null;
  if (savedRange && editorEl.contains(savedRange.startContainer)) {
    range = savedRange;
  } else {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorEl.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    }
  }

  if (range) {
    range.collapse(false);
    range.insertNode(img);
    const spacer = document.createElement("p");
    spacer.innerHTML = "<br>";
    range.setStartAfter(img);
    range.collapse(true);
    range.insertNode(spacer);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else {
    const block = document.createElement("p");
    block.appendChild(img);
    editorEl.appendChild(block);
  }

  img.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return img;
}

function replaceBlobUrlsInEditor(editorEl, blobUrl, serverUrl) {
  if (!editorEl) return;
  editorEl.querySelectorAll("img").forEach((el) => {
    if (el.src === blobUrl) {
      el.src = serverUrl;
    }
  });
}

export default function ModuleEditorToolbar({ editorRef, token, onLog }) {
  const fileInputRef = useRef(null);
  const savedRangeRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const saveEditorSelection = () => {
    const editor = editorRef.current;
    if (!editor || !selectionIsInsideEditor(editor)) {
      savedRangeRef.current = null;
      return;
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const focusEditor = () => {
    editorRef.current?.focus();
  };

  const runCommand = (command, value = null) => {
    focusEditor();
    try {
      document.execCommand(command, false, value);
    } catch (err) {
      onLog?.(err.message || `Could not run ${command}`);
    }
  };

  const handleImagePick = () => {
    saveEditorSelection();
    setUploadError("");
    fileInputRef.current?.click();
  };

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!token) {
      setUploadError("Sign in again to upload images.");
      return;
    }

    const editor = editorRef.current;
    if (!editor) {
      setUploadError("Editor not ready. Try again.");
      return;
    }

    setUploadError("");
    setUploading(true);

    const blobUrl = URL.createObjectURL(file);
    const savedRange = savedRangeRef.current;
    focusEditor();
    insertImageIntoEditor(editor, blobUrl, file.name, savedRange);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch(`${API_BASE_URL}/api/admin/module-assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.message || `Upload failed (${response.status})`);
      }
      const path = body.url || `/api/module-assets/${body.id}`;
      const imageUrl = path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
      replaceBlobUrlsInEditor(editor, blobUrl, imageUrl);
      onLog?.("Image added to module content.");
    } catch (err) {
      editor.querySelectorAll("img").forEach((el) => {
        if (el.src === blobUrl) el.remove();
      });
      const message = err.message || "Image upload failed";
      setUploadError(message);
      onLog?.(message);
    } finally {
      URL.revokeObjectURL(blobUrl);
      setUploading(false);
      savedRangeRef.current = null;
    }
  };

  return (
    <div className="module-editor-toolbar-wrap">
      <div className="module-editor-toolbar" role="toolbar" aria-label="Module formatting">
        <div className="module-editor-toolbar-group">
          <button
            type="button"
            className="module-editor-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("bold")}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className="module-editor-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("italic")}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className="module-editor-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("underline")}
            title="Underline"
          >
            <u>U</u>
          </button>
        </div>
        <span className="module-editor-toolbar-sep" aria-hidden="true" />
        <div className="module-editor-toolbar-group">
          <button
            type="button"
            className="module-editor-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("insertUnorderedList")}
            title="Bullet list"
          >
            • List
          </button>
          <button
            type="button"
            className="module-editor-toolbar-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => runCommand("insertOrderedList")}
            title="Numbered list"
          >
            1. List
          </button>
        </div>
        <span className="module-editor-toolbar-sep" aria-hidden="true" />
        <div className="module-editor-toolbar-group">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: "none" }}
            onChange={handleImageFile}
          />
          <button
            type="button"
            className="module-editor-toolbar-btn module-editor-toolbar-btn--image"
            onMouseDown={(e) => {
              e.preventDefault();
              saveEditorSelection();
            }}
            onClick={handleImagePick}
            disabled={uploading}
            title="Upload image (JPEG, PNG, GIF, WebP — max 5 MB)"
          >
            {uploading ? "Uploading…" : "Image"}
          </button>
        </div>
      </div>
      {uploadError ? (
        <p className="module-editor-upload-error" role="alert">
          {uploadError}
        </p>
      ) : null}
      <p className="module-editor-upload-hint">
        Click in the content area first, then use Image. You will see a preview while it uploads.
      </p>
    </div>
  );
}
