import React, { useState, useEffect, useMemo } from 'react';
import { User, Course, LearningGame } from '../types';
import {
  Gamepad2,
  Plus,
  Search,
  ExternalLink,
  Trash2,
  Edit2,
  Play,
  Sparkles,
  BookOpen,
  Filter,
  Layers,
  X,
  Check,
  User as UserIcon,
  Globe,
  Share2,
  Info,
} from 'lucide-react';
import {
  getStoredLearningGames,
  fetchLearningGamesFromApi,
  saveLearningGameApi,
  deleteLearningGameApi,
  recordGamePlay,
} from '../lib/storage';

interface LearningGamesViewProps {
  currentUser: User | null;
  courses?: Course[];
  onOpenLogin?: () => void;
}

const PLATFORM_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Wordwall: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  Kahoot: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  Quizizz: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
  Quizlet: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  Blooket: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Gimkit: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  Baamboozle: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  Khác: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' },
};

export const LearningGamesView: React.FC<LearningGamesViewProps> = ({
  currentUser,
  courses = [],
  onOpenLogin,
}) => {
  const [games, setGames] = useState<LearningGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGrade, setSelectedGrade] = useState<string>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');

  // Modal State for Teacher (Create / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGame, setEditingGame] = useState<LearningGame | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    gameUrl: '',
    subject: '',
    grade: '10',
    platform: 'Wordwall' as LearningGame['platform'],
    courseId: '',
  });
  const [saving, setSaving] = useState(false);
  const [activePlayGame, setActivePlayGame] = useState<LearningGame | null>(null);

  const isTeacherOrAdmin =
    currentUser?.role === 'ADMIN' ||
    currentUser?.role === 'TEACHER' ||
    Boolean(currentUser?.isTeacher);

  // Load games from server and cache
  useEffect(() => {
    const cached = getStoredLearningGames();
    if (cached && cached.length > 0) {
      setGames(cached);
      setLoading(false);
    }
    fetchLearningGamesFromApi().then((data) => {
      setGames(data);
      setLoading(false);
    });

    const handleUpdate = () => {
      setGames(getStoredLearningGames());
    };
    window.addEventListener('lms-games-updated', handleUpdate);
    return () => {
      window.removeEventListener('lms-games-updated', handleUpdate);
    };
  }, []);

  const handleOpenAddModal = () => {
    setEditingGame(null);
    setFormData({
      title: '',
      description: '',
      gameUrl: '',
      subject: 'Vật lí',
      grade: '10',
      platform: 'Wordwall',
      courseId: '',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (game: LearningGame) => {
    setEditingGame(game);
    setFormData({
      title: game.title,
      description: game.description || '',
      gameUrl: game.gameUrl,
      subject: game.subject || '',
      grade: game.grade || '10',
      platform: game.platform || 'Wordwall',
      courseId: game.courseId || '',
    });
    setModalOpen(true);
  };

  const handleSaveGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim() || !formData.gameUrl.trim()) {
      alert('Vui lòng nhập tiêu đề và liên kết (URL) trò chơi.');
      return;
    }

    setSaving(true);
    try {
      const selectedCourse = courses.find((c) => c.courseId === formData.courseId);
      const payload: Partial<LearningGame> = {
        ...(editingGame ? { id: editingGame.id } : {}),
        title: formData.title.trim(),
        description: formData.description.trim(),
        gameUrl: formData.gameUrl.trim(),
        subject: formData.subject.trim(),
        grade: formData.grade,
        platform: formData.platform,
        courseId: formData.courseId || undefined,
        courseTitle: selectedCourse?.title || undefined,
      };

      const res = await saveLearningGameApi(payload, currentUser);
      if (res) {
        setModalOpen(false);
        const updated = await fetchLearningGamesFromApi();
        setGames(updated);
      } else {
        alert('Không thể lưu trò chơi. Vui lòng kiểm tra lại kết nối!');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteGame = async (game: LearningGame) => {
    if (!confirm(`Bạn có chắc chắn muốn xóa trò chơi "${game.title}"?`)) return;
    const ok = await deleteLearningGameApi(game.id);
    if (ok) {
      setGames((prev) => prev.filter((g) => g.id !== game.id));
    } else {
      alert('Không thể xóa trò chơi. Vui lòng thử lại!');
    }
  };

  const handlePlayGame = (game: LearningGame) => {
    recordGamePlay(game.id);
    setActivePlayGame(game);
  };

  // Filtered games
  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      if (selectedGrade !== 'ALL' && g.grade && g.grade !== selectedGrade) {
        return false;
      }
      if (selectedPlatform !== 'ALL' && g.platform && g.platform !== selectedPlatform) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const titleMatch = (g.title || '').toLowerCase().includes(q);
        const descMatch = (g.description || '').toLowerCase().includes(q);
        const authorMatch = (g.authorName || '').toLowerCase().includes(q);
        const subjMatch = (g.subject || '').toLowerCase().includes(q);
        const courseMatch = (g.courseTitle || '').toLowerCase().includes(q);
        if (!titleMatch && !descMatch && !authorMatch && !subjMatch && !courseMatch) {
          return false;
        }
      }
      return true;
    });
  }, [games, selectedGrade, selectedPlatform, searchQuery]);

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* 1. Header Box - Thiết kế chuẩn đồng bộ như tab Góc hỏi đáp (Q&A) */}
      <div className="bg-white rounded-3xl px-5 sm:px-6 py-2.5 min-h-[65px] border border-slate-200/90 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-600 shadow-2xs shrink-0">
            <Gamepad2 className="w-5 h-5" />
          </div>
          <h2 className="text-lg sm:text-xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-600 via-sky-600 to-blue-600 tracking-tight uppercase">
            KHO TRÒ CHƠI ÔN TẬP KIẾN THỨC
          </h2>
        </div>

        {/* Action button for Teacher / Admin */}
        {isTeacherOrAdmin && (
          <button
            onClick={handleOpenAddModal}
            className="px-3.5 sm:px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-sm hover:shadow-md hover:scale-102 transition-all flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Thêm trò chơi</span>
            <span className="sm:hidden">Thêm</span>
          </button>
        )}
      </div>

      {/* 2. Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm trò chơi theo tên, môn học, giáo viên..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter dropdowns */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {/* Grade filter */}
          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            <option value="ALL">Tất cả khối lớp</option>
            <option value="10">Khối 10</option>
            <option value="11">Khối 11</option>
            <option value="12">Khối 12</option>
          </select>

          {/* Platform filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
          >
            <option value="ALL">Tất cả nền tảng</option>
            <option value="Wordwall">Wordwall</option>
            <option value="Kahoot">Kahoot</option>
            <option value="Quizizz">Quizizz</option>
            <option value="Quizlet">Quizlet</option>
            <option value="Blooket">Blooket</option>
            <option value="Gimkit">Gimkit</option>
            <option value="Baamboozle">Baamboozle</option>
            <option value="Khác">Khác</option>
          </select>
        </div>
      </div>

      {/* 3. Games Grid */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-400">
          <Gamepad2 className="w-10 h-10 mx-auto text-blue-500 animate-bounce mb-3" />
          <p className="font-semibold text-sm">Đang tải kho trò chơi ôn tập...</p>
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center text-slate-500 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shadow-inner">
            <Gamepad2 className="w-8 h-8" />
          </div>
          <h3 className="font-bold text-slate-800 text-base">Chưa có trò chơi ôn tập nào phù hợp</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {isTeacherOrAdmin
              ? 'Thầy cô hãy bấm nút "Thêm link trò chơi mới" ở góc trên để chia sẻ các hoạt động ôn tập tương tác cho học sinh.'
              : 'Hiện chưa có trò chơi nào cho bộ lọc này. Bạn hãy quay lại sau nhé!'}
          </p>
          {isTeacherOrAdmin && (
            <button
              onClick={handleOpenAddModal}
              className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tạo trò chơi đầu tiên</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5">
          {filteredGames.map((game) => {
            const pBadge = PLATFORM_BADGES[game.platform || 'Khác'] || PLATFORM_BADGES['Khác'];
            const canManage =
              currentUser?.role === 'ADMIN' ||
              (isTeacherOrAdmin &&
                (!game.authorId ||
                  String(game.authorId).toLowerCase() === String(currentUser?.idUser).toLowerCase()));

            return (
              <div
                key={game.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col overflow-hidden group"
              >
                {/* Header card with gradient / platform badge */}
                <div className="p-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white relative overflow-hidden flex flex-col justify-between min-h-[110px]">
                  <div className="absolute right-0 top-0 w-24 h-24 bg-white/5 rounded-full blur-xl pointer-events-none" />
                  <div className="flex items-center justify-between gap-2 relative z-10">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-black text-[10px] uppercase tracking-wider border shadow-2xs ${pBadge.bg} ${pBadge.text} ${pBadge.border}`}
                    >
                      {game.platform || 'Trò chơi'}
                    </span>
                    {game.grade && (
                      <span className="px-2 py-0.5 rounded-md bg-white/20 text-white font-bold text-[10px] backdrop-blur-xs">
                        Khối {game.grade}
                      </span>
                    )}
                  </div>

                  <div className="relative z-10 mt-2">
                    <h3 className="font-extrabold text-white text-sm line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
                      {game.title}
                    </h3>
                  </div>
                </div>

                {/* Body Content */}
                <div className="p-4 flex flex-col flex-grow space-y-2.5">
                  {game.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed flex-grow">
                      {game.description}
                    </p>
                  )}

                  <div className="space-y-1 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                      <UserIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        <b>GV:</b> {game.authorName || 'Giáo viên'}
                      </span>
                    </div>

                    {game.subject && (
                      <div className="flex items-center gap-1.5 text-slate-600">
                        <BookOpen className="w-3.5 h-3.5 shrink-0 text-blue-500" />
                        <span>Môn: <b>{game.subject}</b></span>
                      </div>
                    )}

                    {game.courseTitle && (
                      <div className="flex items-center gap-1.5 text-slate-600 truncate">
                        <Layers className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                        <span className="truncate">Thuộc: <b>{game.courseTitle}</b></span>
                      </div>
                    )}
                  </div>

                  {/* Footer Actions */}
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                    {/* Play Game Button */}
                    <button
                      onClick={() => handlePlayGame(game)}
                      className="flex-1 py-2 px-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Chơi ngay</span>
                    </button>

                    {/* Open in new tab */}
                    <a
                      href={game.gameUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => recordGamePlay(game.id)}
                      className="p-2 border border-slate-200 hover:border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl transition-colors cursor-pointer"
                      title="Mở tab mới"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>

                    {/* Teacher Edit & Delete */}
                    {canManage && (
                      <>
                        <button
                          onClick={() => handleOpenEditModal(game)}
                          className="p-2 border border-slate-200 hover:border-amber-300 hover:bg-amber-50 text-slate-600 hover:text-amber-700 rounded-xl transition-colors cursor-pointer"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteGame(game)}
                          className="p-2 border border-slate-200 hover:border-rose-300 hover:bg-rose-50 text-slate-600 hover:text-rose-600 rounded-xl transition-colors cursor-pointer"
                          title="Xóa trò chơi"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MODAL: CREATE / EDIT GAME (Teacher & Admin) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 bg-gradient-to-r from-blue-700 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5 text-amber-300" />
                <h3 className="font-bold text-base">
                  {editingGame ? 'Chỉnh sửa trò chơi ôn tập' : 'Thêm trò chơi ôn tập mới'}
                </h3>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveGame} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Tiêu đề trò chơi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Ví dụ: Ôn tập Động học chất điểm - Vật lí 10"
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Liên kết (URL) trò chơi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="url"
                  required
                  value={formData.gameUrl}
                  onChange={(e) => {
                    const u = e.target.value;
                    let p = formData.platform;
                    const uLower = u.toLowerCase();
                    if (uLower.includes('wordwall.net')) p = 'Wordwall';
                    else if (uLower.includes('kahoot')) p = 'Kahoot';
                    else if (uLower.includes('quizizz')) p = 'Quizizz';
                    else if (uLower.includes('quizlet')) p = 'Quizlet';
                    else if (uLower.includes('blooket')) p = 'Blooket';
                    else if (uLower.includes('gimkit')) p = 'Gimkit';
                    else if (uLower.includes('baamboozle')) p = 'Baamboozle';
                    setFormData({ ...formData, gameUrl: u, platform: p });
                  }}
                  placeholder="https://wordwall.net/resource/... hoặc https://kahoot.it/..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Hỗ trợ link nhúng hoặc link chơi trực tiếp từ Wordwall, Kahoot, Quizizz, Quizlet, Blooket,...
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nền tảng
                  </label>
                  <select
                    value={formData.platform}
                    onChange={(e) => setFormData({ ...formData, platform: e.target.value as any })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="Wordwall">Wordwall</option>
                    <option value="Kahoot">Kahoot</option>
                    <option value="Quizizz">Quizizz</option>
                    <option value="Quizlet">Quizlet</option>
                    <option value="Blooket">Blooket</option>
                    <option value="Gimkit">Gimkit</option>
                    <option value="Baamboozle">Baamboozle</option>
                    <option value="Khác">Nền tảng khác</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Khối lớp
                  </label>
                  <select
                    value={formData.grade}
                    onChange={(e) => setFormData({ ...formData, grade: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  >
                    <option value="10">Khối 10</option>
                    <option value="11">Khối 11</option>
                    <option value="12">Khối 12</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Môn học
                  </label>
                  <input
                    type="text"
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    placeholder="Vật lí, Hóa học..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Gắn với khóa học (tùy chọn)
                  </label>
                  <select
                    value={formData.courseId}
                    onChange={(e) => setFormData({ ...formData, courseId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 truncate"
                  >
                    <option value="">Không gắn khóa học</option>
                    {courses.map((c) => (
                      <option key={c.courseId} value={c.courseId}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mô tả / Hướng dẫn cách chơi (tùy chọn)
                </label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ghi chú nội dung ôn tập, quy tắc hoặc thời gian hoàn thành..."
                  className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{saving ? 'Đang lưu...' : 'Lưu trò chơi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. MODAL: EMBEDDED GAME PLAYER (Interactive Modal) */}
      {activePlayGame && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex flex-col p-2 sm:p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl flex-1 flex flex-col overflow-hidden shadow-2xl">
            {/* Player Header */}
            <div className="px-4 py-3 bg-slate-800/90 border-b border-slate-700/80 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="p-1.5 bg-blue-600 rounded-lg text-white">
                  <Gamepad2 className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm truncate">
                    {activePlayGame.title}
                  </h3>
                  <span className="text-[11px] text-amber-300 font-medium">
                    {activePlayGame.platform || 'Trò chơi ôn tập'} • GV: {activePlayGame.authorName || 'Nguyễn Quang Diêu'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={activePlayGame.gameUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                  title="Mở toàn màn hình trong tab mới"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Mở tab mới</span>
                </a>
                <button
                  onClick={() => setActivePlayGame(null)}
                  className="p-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl transition-colors cursor-pointer"
                  title="Đóng trò chơi"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Iframe Viewport */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden">
              <iframe
                src={
                  // Convert standard Wordwall URL to embed if needed
                  activePlayGame.gameUrl.includes('wordwall.net/resource/') && !activePlayGame.gameUrl.includes('/embed')
                    ? activePlayGame.gameUrl.replace('/resource/', '/embed/')
                    : activePlayGame.gameUrl
                }
                title={activePlayGame.title}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
