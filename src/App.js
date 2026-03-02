import React, { useState, useEffect, useMemo } from "react";
import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInAnonymously } from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  onSnapshot,
  query,
  addDoc,
  serverTimestamp,
  deleteDoc,
} from "firebase/firestore";
import {
  Home,
  ClipboardList,
  CheckCircle,
  PlusCircle,
  ArrowRightLeft,
  TrendingUp,
  History,
  LogOut,
  X,
  MessageSquare,
  Settings,
  Trash2,
  ArrowUp,
  ArrowDown,
  UserPlus,
  Loader2,
  Sparkles,
} from "lucide-react";

// ==========================================
// 🚀 快速設定區
// ==========================================
const SITE_NAME = "勤務支援中心";

const firebaseConfig = {
  apiKey: "AIzaSyAR1GzSueTAQvTTA0LfIYLfuOn9bBtrVDI",
  authDomain: "yilan-99e2b.firebaseapp.com",
  projectId: "yilan-99e2b",
  storageBucket: "yilan-99e2b.firebasestorage.app",
  messagingSenderId: "971422172769",
  appId: "1:971422172769:web:718c4a2aa464d7b10b4c20",
};

const PROJECT_ID = "squad-a-duty-support";

// 初始名單打包 (解決新增覆蓋問題)
const INITIAL_ROSTER_DATA = [
  ...[
    "蘇原德",
    "俞錦昌",
    "陳凱揚",
    "黃巍",
    "林正倫",
    "陳冠銘",
    "劉家銘",
    "林政彥",
    "游子逵",
    "廖國鈞",
    "陳昭閔",
    "游翼誠",
    "馬國郡",
    "杜岡儒",
    "陳建安",
    "梁辰宇",
    "劉政鍾",
    "洪琮棋",
    "陳俊宏",
    "林宏昌",
    "徐裕凱",
    "楊淵文",
  ].map((n, i) => ({ name: n, group: "A", sortIndex: i })),
  ...[
    "蔡睿宇",
    "林振昌",
    "林政毅",
    "陳宏裕",
    "黃世賢",
    "林義益",
    "程冠諺",
    "吳錫隆",
    "劉峻宏",
    "李錫榮",
    "廖於凱",
    "賴勛皓",
    "郭子逢",
    "黃保鳴",
    "阮俊傑",
    "陸明道",
    "陳駿毅",
    "高唯哲",
    "張哲瑋",
    "黃嘉政",
    "鄭佶文",
  ].map((n, i) => ({ name: n, group: "B", sortIndex: i })),
  ...[
    "林泰伯",
    "財俊明",
    "賴洪國",
    "林鍵傑",
    "林志昂",
    "陳家宏",
    "江哲",
    "莊立揚",
    "許育維",
    "廖家郁",
    "方子彥",
    "詹文愷",
    "馮國欽",
    "李岳峰",
    "戴煜恩",
    "吳有佳",
    "林仲華",
    "王聖宏",
    "陳慶瑜",
    "林維慶",
    "林嘉祥",
  ].map((n, i) => ({ name: n, group: "C", sortIndex: i })),
];

const isWorkingDay = (dateStr, group) => {
  const target = new Date(dateStr + "T00:00:00");
  const base = new Date("2026-02-01T00:00:00");
  const diffDays = Math.round(
    (target.getTime() - base.getTime()) / (1000 * 60 * 60 * 24)
  );
  const dayIdx = ((diffDays % 6) + 6) % 6;
  if (dayIdx === 1 || dayIdx === 3 || dayIdx === 5) return false;
  if (dayIdx === 0) return group === "A" || group === "B";
  if (dayIdx === 2) return group === "B" || group === "C";
  if (dayIdx === 4) return group === "C" || group === "A";
  return false;
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const SHIFT_TYPES = {
  FULL: { label: "日夜", cost: 2 },
  DAY: { label: "日班", cost: 1 },
  NIGHT: { label: "夜班", cost: 1 },
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [activeName, setActiveName] = useState(
    () => localStorage.getItem("duty_user") || null
  );
  const [orders, setOrders] = useState([]);

  // 核心修復：名單改為單一雲端檔案，預設空陣列避免閃爍
  const [dynamicRoster, setDynamicRoster] = useState([]);

  const [activeTab, setActiveTab] = useState("home");
  const [showLogin, setShowLogin] = useState(false);
  const [showRosterManager, setShowRosterManager] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [modalType, setModalType] = useState("red");
  const [msg, setMsg] = useState(null);
  const [loginGroup, setLoginGroup] = useState("A");
  const [newName, setNewName] = useState("");

  const [postDate, setPostDate] = useState("");
  const [postShift, setPostShift] = useState("FULL");
  const [postReason, setPostReason] = useState("");
  const [postAmount, setPostAmount] = useState("1000");

  const isAdmin = activeName === "馬國郡";

  useEffect(() => {
    signInAnonymously(auth).catch(console.error);
    const unsubAuth = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubAuth();
  }, []);

  // 1. 抓取/初始化 雲端名單
  useEffect(() => {
    if (!user) return;
    const rosterRef = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "system",
      "roster_v2"
    );

    const unsub = onSnapshot(rosterRef, (docSnap) => {
      if (docSnap.exists()) {
        setDynamicRoster(docSnap.data().members || []);
      } else {
        // 如果雲端沒檔案，一次性把初始名單寫入 (秒開不卡白)
        setDoc(rosterRef, { members: INITIAL_ROSTER_DATA });
        setDynamicRoster(INITIAL_ROSTER_DATA);
      }
    });
    return () => unsub();
  }, [user]);

  // 2. 監聽勤務與個人資料
  useEffect(() => {
    if (!user) return;
    if (!activeName) {
      setShowLogin(true);
      return;
    }

    const unsubOrders = onSnapshot(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
      (s) => setOrders(s.docs.map((d) => ({ id: d.id, ...d.data() })))
    );

    const unsubUser = onSnapshot(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "users", activeName),
      (d) => {
        if (d.exists()) {
          setUserData(d.data());
          setShowLogin(false);
        } else {
          setShowLogin(true);
        }
      }
    );

    return () => {
      unsubOrders();
      unsubUser();
    };
  }, [user, activeName]);

  const showToast = (text, type = "info") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleLogin = async (name, group) => {
    const ref = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      name
    );
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { name, group, points: 2, uid: name });
    }
    setActiveName(name);
    localStorage.setItem("duty_user", name);
    setShowLogin(false);
  };

  const handleLogout = () => {
    setActiveName(null);
    localStorage.removeItem("duty_user");
    setShowLogin(true);
  };

  // --- 管理名單功能 (完全重寫修復) ---
  const updateRosterInCloud = async (newMembers) => {
    await updateDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "system", "roster_v2"),
      {
        members: newMembers,
      }
    );
  };

  const addPerson = async () => {
    if (!newName) return;
    const groupMembers = dynamicRoster.filter((p) => p.group === loginGroup);
    const maxIdx =
      groupMembers.length > 0
        ? Math.max(...groupMembers.map((p) => p.sortIndex))
        : -1;
    const newPerson = {
      name: newName,
      group: loginGroup,
      sortIndex: maxIdx + 1,
    };

    const newRoster = [...dynamicRoster, newPerson];
    await updateRosterInCloud(newRoster);
    setNewName("");
    showToast(`✅ 已新增 ${newName}`);
  };

  const deletePerson = async (name) => {
    if (window.confirm(`確定要刪除 ${name} 嗎？`)) {
      const newRoster = dynamicRoster.filter((p) => p.name !== name);
      await updateRosterInCloud(newRoster);
      showToast(`🗑️ 已刪除 ${name}`);
    }
  };

  const movePerson = async (index, direction) => {
    const groupMembers = dynamicRoster
      .filter((p) => p.group === loginGroup)
      .sort((a, b) => a.sortIndex - b.sortIndex);
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= groupMembers.length) return;

    const current = groupMembers[index];
    const target = groupMembers[targetIdx];

    // 交換排序號碼
    const newRoster = dynamicRoster.map((p) => {
      if (p.name === current.name) return { ...p, sortIndex: target.sortIndex };
      if (p.name === target.name) return { ...p, sortIndex: current.sortIndex };
      return p;
    });

    await updateRosterInCloud(newRoster);
  };

  // --- 勤務核心邏輯 ---
  const postOrder = async (formData) => {
    const { date, shiftType, type, reason, amount } = formData;
    await addDoc(
      collection(db, "artifacts", PROJECT_ID, "public", "data", "orders"),
      {
        creatorId: activeName,
        creatorName: activeName,
        creatorGroup: userData.group,
        date,
        shiftType,
        type,
        reason,
        amount: amount === "" ? 1000 : Number(amount),
        status: "open",
        createdAt: serverTimestamp(),
      }
    );
    setShowPostModal(false);
    showToast("✅ 發布成功！", "success");
  };

  const handleMatch = async (order) => {
    const cost = SHIFT_TYPES[order.shiftType]?.cost || 2;
    const workerId = order.type === "red" ? activeName : order.creatorId;
    const workerRef = doc(
      db,
      "artifacts",
      PROJECT_ID,
      "public",
      "data",
      "users",
      workerId
    );
    const workerData = (await getDoc(workerRef)).data();
    await updateDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", order.id),
      {
        status: "matched",
        workerId: activeName,
        workerName: activeName,
        matchedAt: serverTimestamp(),
      }
    );
    await updateDoc(workerRef, { points: (workerData.points || 0) - cost });
    showToast("🤝 配對成功！", "success");
    setActiveTab("completed");
  };

  const deleteOrder = async (id) => {
    if (!window.confirm("確定要刪除這筆紀錄嗎？")) return;
    await deleteDoc(
      doc(db, "artifacts", PROJECT_ID, "public", "data", "orders", id)
    );
    showToast("🗑️ 已移除紀錄");
  };

  const openOrdersMemo = useMemo(
    () =>
      orders
        .filter((o) => o.status === "open")
        .sort((a, b) => new Date(a.date) - new Date(b.date)),
    [orders]
  );
  const matchedOrdersMemo = useMemo(
    () =>
      orders
        .filter((o) => o.status === "matched")
        .sort(
          (a, b) => (b.matchedAt?.seconds || 0) - (a.matchedAt?.seconds || 0)
        ),
    [orders]
  );

  const getPointsStatusText = (points) => {
    if (points === null || points === undefined) return "-";
    if (points >= 2) return "本月狀態：未加班";
    if (points === 1) return "本月狀態：已加半天";
    if (points <= 0) return "本月狀態：已加滿";
    return "時數注意";
  };

  if (!user)
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-500 w-8 h-8" />
      </div>
    );

  return (
    <div className="min-h-screen bg-[#F4F6F8] max-w-md mx-auto relative font-sans overflow-x-hidden text-slate-800">
      <style>{` ::-webkit-scrollbar { display: none; } html { -ms-overflow-style: none; scrollbar-width: none; scroll-behavior: smooth; } `}</style>

      {/* 提示訊息 */}
      {msg && (
        <div className="fixed top-6 left-0 right-0 z-[100] flex justify-center px-4 pointer-events-none">
          <div
            className={`px-6 py-3.5 rounded-full text-white text-sm font-bold shadow-xl shadow-black/10 animate-in fade-in slide-in-from-top-4 flex items-center gap-2 ${
              msg.type === "error" ? "bg-rose-600" : "bg-slate-800"
            }`}
          >
            {msg.type === "success" && (
              <Sparkles size={16} className="text-amber-300" />
            )}
            {msg.text}
          </div>
        </div>
      )}

      {/* 登入視窗 */}
      {showLogin && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-5">
          <div className="bg-white w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-[2.5rem] p-7 sm:p-8 space-y-7 shadow-2xl animate-in zoom-in-95">
            <div className="text-center">
              <div className="w-14 h-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                <CheckCircle size={28} strokeWidth={2.5} />
              </div>
              <h1 className="text-2xl font-black tracking-wide text-slate-900">
                登入系統
              </h1>
            </div>

            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-3 text-sm font-black rounded-xl transition-all active:scale-95 ${
                    loginGroup === g
                      ? "bg-white shadow-sm text-indigo-600"
                      : "text-slate-400"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>

            <div className="max-h-[35vh] overflow-y-auto grid grid-cols-2 gap-3 pr-2">
              {dynamicRoster
                .filter((p) => p.group === loginGroup)
                .sort((a, b) => a.sortIndex - b.sortIndex)
                .map((p) => (
                  <button
                    key={p.name}
                    onClick={() => handleLogin(p.name, p.group)}
                    className="p-4 border border-slate-100 bg-slate-50/50 rounded-2xl font-black text-slate-700 hover:border-indigo-200 active:bg-indigo-50 active:text-indigo-700 active:scale-95 transition-all"
                  >
                    {p.name}
                  </button>
                ))}
            </div>

            {isAdmin && (
              <button
                onClick={() => setShowRosterManager(true)}
                className="w-full py-4 flex items-center justify-center gap-2 text-slate-400 text-sm font-bold border-t border-slate-100 mt-2 active:bg-slate-50 rounded-xl transition-colors"
              >
                <Settings size={16} /> ⚙️ 管理名單
              </button>
            )}
          </div>
        </div>
      )}

      {/* 名單管理 */}
      {showRosterManager && (
        <div className="fixed inset-0 z-[70] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-full">
          <div className="p-5 border-b border-slate-200 bg-white flex justify-between items-center shadow-sm sticky top-0 z-10">
            <h2 className="font-black text-xl text-slate-800 flex items-center gap-2">
              <Settings size={22} className="text-indigo-600" /> 名單管理
            </h2>
            <button
              onClick={() => setShowRosterManager(false)}
              className="p-2 bg-slate-100 text-slate-500 rounded-full active:scale-90 transition-all"
            >
              <X size={20} />
            </button>
          </div>

          <div className="p-5 bg-white space-y-5 shadow-sm">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl">
              {["A", "B", "C"].map((g) => (
                <button
                  key={g}
                  onClick={() => setLoginGroup(g)}
                  className={`flex-1 py-2.5 text-sm font-black rounded-xl transition-all active:scale-95 ${
                    loginGroup === g
                      ? "bg-white shadow-sm text-indigo-600"
                      : "text-slate-400"
                  }`}
                >
                  {g}組
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="輸入新組員姓名..."
                className="flex-1 p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow"
              />
              <button
                onClick={addPerson}
                className="p-4 bg-indigo-600 text-white rounded-2xl shadow-md active:scale-95 transition-all"
              >
                <UserPlus size={24} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-3 pb-10">
            {dynamicRoster
              .filter((p) => p.group === loginGroup)
              .sort((a, b) => a.sortIndex - b.sortIndex)
              .map((p, idx, arr) => (
                <div
                  key={p.name}
                  className="flex items-center gap-3 p-4 bg-white rounded-2xl shadow-sm border border-slate-100"
                >
                  <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center text-xs font-black">
                    {idx + 1}
                  </div>
                  <span className="font-black text-slate-700 flex-1 text-lg">
                    {p.name}
                  </span>
                  <div className="flex gap-1 bg-slate-50 rounded-xl p-1 border border-slate-100">
                    <button
                      onClick={() => movePerson(idx, "up")}
                      disabled={idx === 0}
                      className="p-2.5 text-slate-500 disabled:opacity-20 active:bg-slate-200 rounded-lg transition-colors"
                    >
                      <ArrowUp size={18} strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => movePerson(idx, "down")}
                      disabled={idx === arr.length - 1}
                      className="p-2.5 text-slate-500 disabled:opacity-20 active:bg-slate-200 rounded-lg transition-colors"
                    >
                      <ArrowDown size={18} strokeWidth={3} />
                    </button>
                    <div className="w-[1px] bg-slate-200 mx-1 my-2"></div>
                    <button
                      onClick={() => deletePerson(p.name)}
                      className="p-2.5 text-rose-500 active:bg-rose-50 rounded-lg transition-colors"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* 頂部導覽列 (毛玻璃) */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-xl pt-6 pb-4 px-5 flex justify-between items-center z-40 border-b border-slate-200/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
            <ClipboardList size={18} strokeWidth={2.5} />
          </div>
          <h1 className="font-black text-slate-900 tracking-wide text-lg">
            {SITE_NAME}
          </h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowRosterManager(true)}
              className="p-2.5 bg-slate-100 text-slate-600 rounded-full active:scale-90 transition-all hover:bg-slate-200"
            >
              <Settings size={18} />
            </button>
          )}
          <button
            onClick={handleLogout}
            className="p-2.5 bg-slate-100 text-slate-600 rounded-full active:scale-90 transition-all hover:bg-rose-50 hover:text-rose-600"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* 內容區：增加底部墊高 (pb-36) 防止擋住內容 */}
      <main className="p-4 sm:p-5 space-y-6 pb-36">
        {activeTab === "home" ? (
          <>
            {/* 高質感個人黑卡 */}
            <div className="bg-gradient-to-br from-slate-800 via-slate-900 to-indigo-950 rounded-[2rem] p-7 text-white shadow-xl shadow-slate-900/10 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -mr-10 -mt-10"></div>
              <div className="relative z-10 flex flex-col gap-2">
                <div className="flex justify-between items-center mb-2">
                  <span className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-full text-xs font-bold tracking-widest border border-white/10 uppercase">
                    {userData?.group}組
                  </span>
                  <span className="font-bold tracking-widest opacity-80">
                    {activeName}
                  </span>
                </div>
                <h2 className="text-3xl font-black tracking-tight mt-2">
                  {getPointsStatusText(userData?.points)}
                </h2>
              </div>
              <TrendingUp
                size={120}
                className="absolute -right-6 -bottom-6 opacity-5 pointer-events-none"
              />
            </div>

            {/* 發布按鈕 */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setModalType("red");
                  setShowPostModal(true);
                }}
                className="bg-white p-5 rounded-[2rem] shadow-sm border border-rose-100/50 text-rose-600 font-bold flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-all hover:shadow-md"
              >
                <div className="bg-rose-50 p-3.5 rounded-full">
                  <PlusCircle size={26} strokeWidth={2.5} />
                </div>
                <span className="tracking-wide">休假申請</span>
              </button>
              <button
                onClick={() => {
                  setModalType("green");
                  setShowPostModal(true);
                }}
                className="bg-white p-5 rounded-[2rem] shadow-sm border border-emerald-100/50 text-emerald-600 font-bold flex flex-col items-center justify-center gap-3 active:scale-[0.97] transition-all hover:shadow-md"
              >
                <div className="bg-emerald-50 p-3.5 rounded-full">
                  <PlusCircle size={26} strokeWidth={2.5} />
                </div>
                <span className="tracking-wide">加班申請</span>
              </button>
            </div>

            {/* 佈告欄 */}
            <div className="space-y-4">
              <h2 className="text-lg font-black flex items-center gap-2 text-slate-800 pl-1">
                <ClipboardList size={22} className="text-indigo-500" />{" "}
                需求佈告欄{" "}
                <span className="text-slate-400 text-sm ml-1">
                  ({openOrdersMemo.length})
                </span>
              </h2>
              {openOrdersMemo.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-[2rem] border border-dashed border-slate-200 shadow-sm">
                  <p className="text-slate-400 font-bold tracking-wide">
                    目前沒有任何需求
                  </p>
                </div>
              ) : (
                openOrdersMemo.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white p-5 rounded-[2rem] border border-slate-100 flex gap-4 shadow-sm relative overflow-hidden group"
                  >
                    <div
                      className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                        order.type === "red" ? "bg-rose-500" : "bg-emerald-500"
                      }`}
                    />
                    <div className="flex-1 pl-1">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <span
                              className={`text-[10px] px-2 py-1 rounded-md font-black tracking-widest ${
                                order.type === "red"
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {order.type === "red" ? "求代班" : "求加班"}
                            </span>
                            <span className="text-sm font-bold text-slate-500">
                              {SHIFT_TYPES[order.shiftType].label}
                            </span>
                          </div>
                          <p className="font-black text-2xl text-slate-800 tracking-tight">
                            {order.date}
                          </p>
                          <p className="text-sm font-bold text-slate-500 mt-1">
                            {order.creatorName}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {(activeName === order.creatorId || isAdmin) && (
                            <button
                              onClick={() => deleteOrder(order.id)}
                              className="p-2 -mr-2 -mt-1 text-slate-300 hover:text-rose-500 active:scale-90 bg-slate-50 hover:bg-rose-50 rounded-full transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                          <span className="font-black text-lg text-slate-700 bg-slate-50 px-2 py-1 rounded-lg">
                            💰{order.amount || 1000}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleMatch(order)}
                        className={`w-full mt-5 py-3.5 rounded-xl text-sm font-black tracking-widest transition-all active:scale-[0.98] shadow-sm ${
                          activeName === order.creatorId
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                            : "bg-slate-800 text-white hover:bg-slate-700"
                        }`}
                        disabled={activeName === order.creatorId}
                      >
                        {activeName === order.creatorId
                          ? "等待配對中"
                          : "幫這個忙"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-black flex items-center gap-2 text-slate-800 pl-1">
              <History size={22} className="text-indigo-500" /> 完成紀錄
            </h2>
            {matchedOrdersMemo.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-[2rem] border border-dashed border-slate-200 shadow-sm">
                <p className="text-slate-400 font-bold tracking-wide">
                  目前沒有配對紀錄
                </p>
              </div>
            ) : (
              matchedOrdersMemo.map((order) => (
                <div
                  key={order.id}
                  className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm relative"
                >
                  <div className="flex justify-between items-center mb-5">
                    <span className="text-[10px] bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full font-black tracking-widest">
                      已配對
                    </span>
                    {(activeName === order.creatorId || isAdmin) && (
                      <button
                        onClick={() => deleteOrder(order.id)}
                        className="p-2 -mr-2 -mt-2 text-slate-300 hover:text-rose-500 active:scale-90 bg-slate-50 rounded-full transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-around text-center bg-slate-50/80 p-4 rounded-2xl border border-slate-100/50">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-400 font-bold tracking-widest mb-1.5">
                        休假人
                      </p>
                      <p className="font-black text-slate-800 text-lg">
                        {order.type === "red"
                          ? order.creatorName
                          : order.workerName}
                      </p>
                    </div>
                    <ArrowRightLeft className="text-slate-300" size={20} />
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-400 font-bold tracking-widest mb-1.5">
                        支援人
                      </p>
                      <p className="font-black text-indigo-600 text-lg">
                        {order.type === "red"
                          ? order.workerName
                          : order.creatorName}
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 pt-4 border-t border-slate-100 flex justify-between items-end">
                    <div>
                      <p className="font-black text-slate-800 text-base">
                        {order.date}
                      </p>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        {SHIFT_TYPES[order.shiftType].label}
                      </p>
                    </div>
                    <span className="font-black text-slate-800 text-xl tracking-tight">
                      💰 {order.amount || 1000}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* 發布單 Modal (美化) */}
      {showPostModal && (
        <div className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm flex items-end justify-center animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-md rounded-t-[2.5rem] p-7 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] animate-in slide-in-from-bottom-8 shadow-2xl">
            <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-6"></div>
            <h2 className="text-2xl font-black mb-6 text-slate-900 flex items-center gap-2">
              {modalType === "red" ? (
                <>
                  <span className="w-3 h-3 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]"></span>{" "}
                  休假支援申請
                </>
              ) : (
                <>
                  <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>{" "}
                  加班支援申請
                </>
              )}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                postOrder({
                  date: postDate,
                  shiftType: postShift,
                  type: modalType,
                  reason: postReason,
                  amount: postAmount,
                });
              }}
              className="space-y-5"
            >
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">
                  選擇日期
                </label>
                <input
                  required
                  type="date"
                  value={postDate}
                  onChange={(e) => setPostDate(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">
                  選擇班別
                </label>
                <select
                  value={postShift}
                  onChange={(e) => setPostShift(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none appearance-none text-slate-700 transition-all"
                >
                  <option value="FULL">日夜</option>
                  <option value="DAY">日班</option>
                  <option value="NIGHT">夜班</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">
                  紅包金額 (預設 1000)
                </label>
                <input
                  type="number"
                  placeholder="輸入金額..."
                  value={postAmount}
                  onChange={(e) => setPostAmount(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 ml-1 mb-2 block tracking-wider">
                  備註原因
                </label>
                <input
                  type="text"
                  placeholder="最多10個字..."
                  maxLength="10"
                  value={postReason}
                  onChange={(e) => setPostReason(e.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold focus:ring-2 focus:ring-indigo-500 outline-none text-slate-700 transition-all"
                />
              </div>
              <div className="flex gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowPostModal(false)}
                  className="flex-1 p-4 font-black text-slate-500 bg-slate-100 hover:bg-slate-200 rounded-2xl active:scale-[0.98] transition-all"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`flex-[2] p-4 rounded-2xl font-black text-white shadow-lg active:scale-[0.98] transition-all ${
                    modalType === "red"
                      ? "bg-rose-600 hover:bg-rose-700 shadow-rose-600/30"
                      : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30"
                  }`}
                >
                  確認發布
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 底部懸浮膠囊導覽 (高質感設計) */}
      <div className="fixed bottom-6 left-0 right-0 px-5 z-40 flex justify-center pointer-events-none">
        <div className="w-full max-w-[280px] flex bg-white/80 backdrop-blur-xl p-2 rounded-[2rem] shadow-[0_8px_30px_rgba(0,0,0,0.12)] border border-slate-200/50 pointer-events-auto">
          <button
            onClick={() => setActiveTab("home")}
            className={`flex-1 py-3 px-4 flex justify-center items-center gap-2 rounded-[1.5rem] transition-all active:scale-[0.98] ${
              activeTab === "home"
                ? "bg-slate-900 text-white shadow-md"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <Home size={20} strokeWidth={activeTab === "home" ? 2.5 : 2} />
            <span
              className={`text-sm font-black tracking-wide ${
                activeTab === "home" ? "block" : "hidden sm:block"
              }`}
            >
              佈告欄
            </span>
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            className={`flex-1 py-3 px-4 flex justify-center items-center gap-2 rounded-[1.5rem] transition-all active:scale-[0.98] ${
              activeTab === "completed"
                ? "bg-slate-900 text-white shadow-md"
                : "text-slate-500 hover:bg-slate-100"
            }`}
          >
            <CheckCircle
              size={20}
              strokeWidth={activeTab === "completed" ? 2.5 : 2}
            />
            <span
              className={`text-sm font-black tracking-wide ${
                activeTab === "completed" ? "block" : "hidden sm:block"
              }`}
            >
              完成區
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
