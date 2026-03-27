import { listConversations, deleteConversation } from './storage.js';
import { timeAgo } from './ui.js';

let sidebarOpen = false;

export function initSidebar({ onNewChat, onLoadChat }) {
  const overlay = document.getElementById("sidebar-overlay");
  const sidebar = document.getElementById("sidebar");
  const hamburger = document.getElementById("hamburger");
  const newChatBtn = document.getElementById("new-chat-btn");

  hamburger.addEventListener("click", () => toggleSidebar());
  overlay.addEventListener("click", () => closeSidebar());
  newChatBtn.addEventListener("click", () => { closeSidebar(); onNewChat(); });

  document.getElementById("conv-list").addEventListener("click", (e) => {
    const del = e.target.closest(".conv-del");
    if (del) {
      e.stopPropagation();
      const id = del.dataset.id;
      deleteConversation(id);
      renderConversationList(onLoadChat);
      return;
    }
    const item = e.target.closest(".conv-item");
    if (item) {
      closeSidebar();
      onLoadChat(item.dataset.id);
    }
  });
}

export function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById("sidebar").classList.toggle("open", sidebarOpen);
  document.getElementById("sidebar-overlay").classList.toggle("open", sidebarOpen);
}

export function closeSidebar() {
  sidebarOpen = false;
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-overlay").classList.remove("open");
}

export function renderConversationList(onLoadChat) {
  const convs = listConversations();
  const el = document.getElementById("conv-list");
  if (!convs.length) {
    el.innerHTML = '<div style="padding:20px;text-align:center;color:#444;font-size:12px">No conversations yet</div>';
    return;
  }
  el.innerHTML = convs.map(c => `
    <div class="conv-item" data-id="${c.id}">
      <div class="conv-info">
        <div class="conv-title">${c.title || "New chat"}</div>
        <div class="conv-time">${timeAgo(c.updatedAt)}</div>
      </div>
      <button class="conv-del" data-id="${c.id}">✕</button>
    </div>
  `).join("");
}
