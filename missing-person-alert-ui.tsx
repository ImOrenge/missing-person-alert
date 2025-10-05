import React, { useState, useEffect } from 'react';
import { MapPin, User, Clock, AlertTriangle, Filter, Bell, BellOff, X, Share2, Phone, Plus, Upload, Camera, ChevronLeft, ChevronRight, Info, LogIn, LogOut, UserCircle } from 'lucide-react';

// 샘플 데이터
const SAMPLE_DATA = [
  {
    id: 1,
    name: '김민준',
    age: 8,
    gender: 'M',
    location: { lat: 37.5665, lng: 126.9780, address: '서울특별시 종로구 세종대로 209' },
    photo: 'https://via.placeholder.com/300x300/e74c3c/ffffff?text=Missing+Child',
    description: '키 125cm, 파란색 티셔츠 착용',
    missingDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    type: 'missing_child',
    status: 'active'
  },
  {
    id: 2,
    name: '박서연',
    age: 72,
    gender: 'F',
    location: { lat: 37.4979, lng: 127.0276, address: '서울특별시 강남구 테헤란로 152' },
    photo: 'https://via.placeholder.com/300x300/9b59b6/ffffff?text=Dementia',
    description: '키 158cm, 흰색 블라우스 착용, 치매 환자',
    missingDate: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    type: 'dementia',
    status: 'active'
  },
  {
    id: 3,
    name: '이준호',
    age: 25,
    gender: 'M',
    location: { lat: 35.1796, lng: 129.0756, address: '부산광역시 해운대구 우동 1408' },
    photo: 'https://via.placeholder.com/300x300/f39c12/ffffff?text=Disabled',
    description: '키 170cm, 검은색 점퍼 착용, 지적장애',
    missingDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    type: 'disabled',
    status: 'active'
  },
  {
    id: 4,
    name: '정유나',
    age: 15,
    gender: 'F',
    location: { lat: 37.2636, lng: 127.0286, address: '경기도 수원시 영통구 광교중앙로' },
    photo: 'https://via.placeholder.com/300x300/3498db/ffffff?text=Runaway+Teen',
    description: '키 162cm, 교복 착용, 가출 청소년',
    missingDate: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    type: 'runaway',
    status: 'active'
  },
  {
    id: 5,
    name: '최영수',
    age: 45,
    gender: 'M',
    location: { lat: 36.3504, lng: 127.3845, address: '대전광역시 유성구 대학로 99' },
    photo: 'https://via.placeholder.com/300x300/27ae60/ffffff?text=Mental+Health',
    description: '키 175cm, 회색 후드 착용, 정신질환',
    missingDate: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
    type: 'mental_health',
    status: 'active'
  },
  {
    id: 6,
    name: '강지우',
    age: 68,
    gender: 'M',
    location: { lat: 35.8714, lng: 128.6014, address: '대구광역시 수성구 달구벌대로' },
    photo: 'https://via.placeholder.com/300x300/1abc9c/ffffff?text=Elderly',
    description: '키 168cm, 등산복 착용, 노인',
    missingDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    type: 'elderly',
    status: 'active'
  },
  {
    id: 7,
    name: '신하은',
    age: 32,
    gender: 'F',
    location: { lat: 37.4563, lng: 126.7052, address: '인천광역시 남동구 예술로' },
    photo: 'https://via.placeholder.com/300x300/e67e22/ffffff?text=Adult',
    description: '키 165cm, 검은색 원피스 착용',
    missingDate: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
    type: 'adult',
    status: 'active'
  },
  {
    id: 8,
    name: '윤서준',
    age: 5,
    gender: 'M',
    location: { lat: 33.4996, lng: 126.5312, address: '제주특별자치도 제주시 첨단로' },
    photo: 'https://via.placeholder.com/300x300/c0392b/ffffff?text=Infant',
    description: '키 105cm, 노란색 티셔츠 착용, 유아',
    missingDate: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    type: 'infant',
    status: 'active'
  }
];

const REGIONS = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시',
  '경기도', '강원도', '충청북도', '충청남도',
  '전라북도', '전라남도', '경상북도', '경상남도', '제주특별자치도'
];

const ANNOUNCEMENTS = [
  { id: 1, text: '실종자를 발견하시면 즉시 112 또는 182(실종아동찾기센터)로 신고해주세요', type: 'info' },
  { id: 2, text: '허위 신고 시 법적 책임을 질 수 있습니다', type: 'warning' },
  { id: 3, text: '실시간 알림을 켜두시면 새로운 실종자 정보를 즉시 받아보실 수 있습니다', type: 'info' },
  { id: 4, text: '실종자 정보는 경찰청 공공데이터를 기반으로 제공됩니다', type: 'info' },
  { id: 5, text: '실종 골든타임은 48시간입니다. 신속한 제보가 생명을 살립니다', type: 'warning' }
];

export default function MissingPersonAlertApp() {
  const [persons, setPersons] = useState(SAMPLE_DATA);
  const [selectedPerson, setSelectedPerson] = useState(null);
  const [isConnected, setIsConnected] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [currentAnnouncementIndex, setCurrentAnnouncementIndex] = useState(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginForm, setLoginForm] = useState({ name: '', email: '' });
  const [filters, setFilters] = useState({
    regions: [],
    types: ['missing_child', 'infant', 'runaway', 'disabled', 'dementia', 'mental_health', 'elderly', 'adult'],
    timeRange: 'all'
  });
  const [notifications, setNotifications] = useState(true);
  const [showNotification, setShowNotification] = useState(false);
  const [reportForm, setReportForm] = useState({
    name: '',
    age: '',
    gender: 'M',
    type: 'missing_child',
    photo: null,
    photoPreview: null,
    address: '',
    detailedLocation: '',
    missingDate: '',
    missingTime: '',
    height: '',
    weight: '',
    clothing: '',
    features: '',
    contact: '',
    relationship: ''
  });

  // 실시간 알림 시뮬레이션
  useEffect(() => {
    const interval = setInterval(() => {
      if (notifications && Math.random() > 0.7) {
        setShowNotification(true);
        setTimeout(() => setShowNotification(false), 5000);
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [notifications]);

  // 공지사항 자동 슬라이드
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentAnnouncementIndex((prev) => (prev + 1) % ANNOUNCEMENTS.length);
    }, 5000); // 5초마다 변경

    return () => clearInterval(interval);
  }, []);

  const getTypeLabel = (type) => {
    switch (type) {
      case 'missing_child': return '실종 아동';
      case 'infant': return '유아';
      case 'runaway': return '가출 청소년';
      case 'disabled': return '지적장애인';
      case 'dementia': return '치매환자';
      case 'mental_health': return '정신질환';
      case 'elderly': return '노인';
      case 'adult': return '성인';
      default: return '기타';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'missing_child': return 'bg-red-500';
      case 'infant': return 'bg-red-700';
      case 'runaway': return 'bg-blue-500';
      case 'disabled': return 'bg-orange-500';
      case 'dementia': return 'bg-purple-500';
      case 'mental_health': return 'bg-green-600';
      case 'elderly': return 'bg-teal-500';
      case 'adult': return 'bg-orange-600';
      default: return 'bg-gray-500';
    }
  };

  const getTimeSince = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) return `${hours}시간 ${minutes}분 전`;
    return `${minutes}분 전`;
  };

  const filteredPersons = persons.filter(person => {
    if (filters.regions.length > 0) {
      const personRegion = person.location.address.split(' ')[0];
      if (!filters.regions.includes(personRegion)) return false;
    }
    
    if (!filters.types.includes(person.type)) return false;
    
    return true;
  });

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginForm.name && loginForm.email) {
      setIsLoggedIn(true);
      setUserName(loginForm.name);
      setShowLoginModal(false);
      setLoginForm({ name: '', email: '' });
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setUserName('');
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setReportForm({
        ...reportForm,
        photo: file,
        photoPreview: URL.createObjectURL(file)
      });
    }
  };

  const handleSubmitReport = (e) => {
    e.preventDefault();
    
    // 고유 ID 생성 (타임스탬프 + 랜덤 숫자)
    const uniqueId = Date.now() + Math.floor(Math.random() * 10000);
    
    // 새 실종자 데이터 생성
    const newPerson = {
      id: uniqueId,
      name: reportForm.name,
      age: parseInt(reportForm.age),
      gender: reportForm.gender,
      location: {
        lat: 37.5665 + Math.random() * 0.1,
        lng: 126.9780 + Math.random() * 0.1,
        address: reportForm.address + ' ' + reportForm.detailedLocation
      },
      photo: reportForm.photoPreview || 'https://via.placeholder.com/300x300/95a5a6/ffffff?text=No+Photo',
      description: `키 ${reportForm.height || '미상'}cm, 체중 ${reportForm.weight || '미상'}kg, ${reportForm.clothing}${reportForm.features ? ', ' + reportForm.features : ''}`,
      missingDate: new Date(`${reportForm.missingDate}T${reportForm.missingTime}`).toISOString(),
      type: reportForm.type,
      status: 'reported'
    };

    setPersons([newPerson, ...persons]);
    setShowReportModal(false);
    
    // 폼 초기화
    setReportForm({
      name: '',
      age: '',
      gender: 'M',
      type: 'missing_child',
      photo: null,
      photoPreview: null,
      address: '',
      detailedLocation: '',
      missingDate: '',
      missingTime: '',
      height: '',
      weight: '',
      clothing: '',
      features: '',
      contact: '',
      relationship: ''
    });

    // 제보 완료 알림
    setShowNotification(true);
    setTimeout(() => setShowNotification(false), 5000);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans">
      {/* 상단 네비게이션 바 */}
      <div className="bg-white shadow-md py-3 px-6 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h1 className="text-xl font-bold text-gray-800">실종자 긴급 알림 시스템</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {isLoggedIn ? (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 rounded-lg">
                <UserCircle className="w-5 h-5 text-blue-600" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-blue-900">{userName}</span>
                  <span className="text-xs text-blue-600">실 이용자</span>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm font-medium">로그아웃</span>
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
                <User className="w-5 h-5 text-gray-500" />
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-gray-700">게스트</span>
                  <span className="text-xs text-gray-500">비회원</span>
                </div>
              </div>
              <button
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="text-sm font-medium">로그인</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 메인 컨텐츠 영역 */}
      <div className="flex flex-1 relative overflow-hidden">
      {/* 사이드바 */}
      <div 
        className={`bg-white shadow-xl flex flex-col overflow-hidden transition-all duration-300 z-20 ${
          showSidebar ? 'w-96' : 'w-0'
        }`}
      >
        {showSidebar && (
          <>
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-red-500 to-red-600 text-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <AlertTriangle className="w-7 h-7" />
                  실종자 알림
                </h1>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReportModal(true)}
                    className="p-2 bg-white bg-opacity-20 hover:bg-opacity-30 rounded-lg transition-colors"
                    title="실종자 제보"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                  <button
                    onClick={() => setNotifications(!notifications)}
                    className="p-2 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    {notifications ? <Bell className="w-6 h-6" /> : <BellOff className="w-6 h-6" />}
                  </button>
                </div>
              </div>
              
              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
                <span>{isConnected ? '실시간 연결 중' : '연결 끊김'}</span>
              </div>
            </div>

            {/* 필터 버튼 */}
            <div className="p-4 border-b border-gray-200">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-full flex items-center justify-between px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <span className="flex items-center gap-2 font-medium">
                  <Filter className="w-4 h-4" />
                  필터 {filters.regions.length > 0 && `(${filters.regions.length})`}
                </span>
                <span className="text-sm text-gray-600">
                  {filteredPersons.length}건
                </span>
              </button>

              {/* 필터 패널 */}
              {showFilters && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">지역 선택</label>
                    <select
                      multiple
                      className="w-full h-32 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      value={filters.regions}
                      onChange={(e) => {
                        const selected = Array.from(e.target.selectedOptions, opt => opt.value);
                        setFilters({ ...filters, regions: selected });
                      }}
                    >
                      {REGIONS.map(region => (
                        <option key={region} value={region}>{region}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">유형</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { value: 'missing_child', label: '실종 아동', emoji: '👶' },
                        { value: 'infant', label: '유아', emoji: '🍼' },
                        { value: 'runaway', label: '가출 청소년', emoji: '🏃' },
                        { value: 'disabled', label: '지적장애인', emoji: '♿' },
                        { value: 'dementia', label: '치매환자', emoji: '🧠' },
                        { value: 'mental_health', label: '정신질환', emoji: '💊' },
                        { value: 'elderly', label: '노인', emoji: '👴' },
                        { value: 'adult', label: '성인', emoji: '👤' }
                      ].map(({ value, label, emoji }) => (
                        <label key={value} className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filters.types.includes(value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFilters({ ...filters, types: [...filters.types, value] });
                              } else {
                                setFilters({ ...filters, types: filters.types.filter(t => t !== value) });
                              }
                            }}
                            className="w-4 h-4 text-red-500 rounded"
                          />
                          <span className="text-lg">{emoji}</span>
                          <span className="text-sm flex-1">{label}</span>
                        </label>
                      ))}
                    </div>
                    
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => setFilters({ 
                          ...filters, 
                          types: ['missing_child', 'infant', 'runaway', 'disabled', 'dementia', 'mental_health', 'elderly', 'adult'] 
                        })}
                        className="flex-1 px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded text-xs font-medium transition-colors"
                      >
                        전체 선택
                      </button>
                      <button
                        onClick={() => setFilters({ ...filters, types: [] })}
                        className="flex-1 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition-colors"
                      >
                        전체 해제
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={() => setFilters({ 
                      regions: [], 
                      types: ['missing_child', 'infant', 'runaway', 'disabled', 'dementia', 'mental_health', 'elderly', 'adult'], 
                      timeRange: 'all' 
                    })}
                    className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    필터 초기화
                  </button>
                </div>
              )}
            </div>

            {/* 실종자 목록 */}
            <div className="flex-1 overflow-y-auto">
              {filteredPersons.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>해당 조건의 실종자 정보가 없습니다</p>
                </div>
              ) : (
                filteredPersons.map(person => (
                  <div
                    key={person.id}
                    onClick={() => setSelectedPerson(person)}
                    className={`p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-colors ${
                      selectedPerson?.id === person.id ? 'bg-blue-50 border-l-4 border-l-blue-500' : ''
                    }`}
                  >
                    <div className="flex gap-3">
                      <img
                        src={person.photo}
                        alt={person.name}
                        className="w-20 h-20 rounded-lg object-cover"
                      />
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-1">
                          <h3 className="font-bold text-gray-900">{person.name}</h3>
                          <span className={`px-2 py-1 text-xs text-white rounded-full ${getTypeColor(person.type)}`}>
                            {getTypeLabel(person.type)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-1">
                          {person.age}세 · {person.gender === 'M' ? '남성' : '여성'}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                          <MapPin className="w-3 h-3" />
                          <span className="truncate">{person.location.address}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{getTimeSince(person.missingDate)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* 사이드바 토글 버튼 */}
      <button
        onClick={() => setShowSidebar(!showSidebar)}
        className="absolute left-0 top-1/2 transform -translate-y-1/2 bg-white shadow-lg rounded-r-lg p-3 hover:bg-gray-50 transition-all z-30"
        style={{ left: showSidebar ? '384px' : '0px' }}
        title={showSidebar ? '패널 숨기기' : '패널 보기'}
      >
        {showSidebar ? (
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        ) : (
          <div className="flex items-center gap-2">
            <ChevronRight className="w-5 h-5 text-gray-600" />
            <div className="flex flex-col items-center">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="text-xs font-bold text-gray-700 mt-1">{persons.length}</span>
            </div>
          </div>
        )}
      </button>

      {/* 메인 지도 영역 */}
      <div className="flex-1 relative">
        {/* 지도 플레이스홀더 */}
        <div className="w-full h-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
          <div className="text-center">
            <MapPin className="w-24 h-24 mx-auto mb-4 text-blue-400" />
            <p className="text-xl text-gray-600 mb-2">Google Maps 영역</p>
            <p className="text-sm text-gray-500">실종 발생 위치가 마커로 표시됩니다</p>
          </div>
        </div>

        {/* 연결 상태 표시 */}
        <div className={`absolute top-4 right-4 px-4 py-2 rounded-full shadow-lg flex items-center gap-2 text-white font-medium ${
          isConnected ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className={`w-2 h-2 rounded-full bg-white ${isConnected ? 'animate-pulse' : ''}`} />
          {isConnected ? '실시간 연결 중' : '연결 끊김'}
        </div>

        {/* 실시간 알림 토스트 */}
        {showNotification && (
          <div className="absolute top-20 right-4 bg-red-500 text-white p-4 rounded-lg shadow-2xl animate-slide-in-right max-w-sm">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 flex-shrink-0 mt-1" />
              <div>
                <h4 className="font-bold mb-1">🚨 제보가 접수되었습니다</h4>
                <p className="text-sm">관계기관에 전달되어 수색을 시작합니다.</p>
                <p className="text-xs opacity-90 mt-1">제보해주셔서 감사합니다.</p>
              </div>
            </div>
          </div>
        )}

        {/* 실종자 제보 모달 */}
        {showReportModal && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full my-8">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    <Plus className="w-7 h-7" />
                    실종자 제보
                  </h2>
                  <button
                    onClick={() => setShowReportModal(false)}
                    className="p-2 hover:bg-blue-600 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <p className="text-sm mt-2 text-blue-100">실종자 정보를 상세히 입력해주세요. 빠른 발견에 도움이 됩니다.</p>
              </div>

              <form onSubmit={handleSubmitReport} className="p-6 max-h-[70vh] overflow-y-auto">
                {/* 사진 업로드 */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">실종자 사진 *</label>
                  <div className="flex items-center gap-4">
                    {reportForm.photoPreview ? (
                      <div className="relative">
                        <img
                          src={reportForm.photoPreview}
                          alt="Preview"
                          className="w-32 h-32 rounded-lg object-cover border-2 border-gray-200"
                        />
                        <button
                          type="button"
                          onClick={() => setReportForm({ ...reportForm, photo: null, photoPreview: null })}
                          className="absolute -top-2 -right-2 p-1 bg-red-500 text-white rounded-full hover:bg-red-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500 transition-colors">
                        <Camera className="w-8 h-8 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500">사진 추가</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="hidden"
                        />
                      </label>
                    )}
                    <div className="flex-1 text-sm text-gray-600">
                      <p className="mb-1">• 최근 사진을 업로드해주세요</p>
                      <p className="mb-1">• 얼굴이 선명하게 보이는 사진</p>
                      <p>• JPG, PNG 형식 (최대 5MB)</p>
                    </div>
                  </div>
                </div>

                {/* 기본 정보 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">이름 *</label>
                    <input
                      type="text"
                      required
                      value={reportForm.name}
                      onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="실종자 이름"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">나이 *</label>
                    <input
                      type="number"
                      required
                      value={reportForm.age}
                      onChange={(e) => setReportForm({ ...reportForm, age: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="만 나이"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">성별 *</label>
                    <select
                      value={reportForm.gender}
                      onChange={(e) => setReportForm({ ...reportForm, gender: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="M">남성</option>
                      <option value="F">여성</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">실종자 유형 *</label>
                    <select
                      value={reportForm.type}
                      onChange={(e) => setReportForm({ ...reportForm, type: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="missing_child">실종 아동</option>
                      <option value="infant">유아</option>
                      <option value="runaway">가출 청소년</option>
                      <option value="disabled">지적장애인</option>
                      <option value="dementia">치매환자</option>
                      <option value="mental_health">정신질환</option>
                      <option value="elderly">노인</option>
                      <option value="adult">성인</option>
                    </select>
                  </div>
                </div>

                {/* 실종 위치 */}
                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">실종 장소 *</label>
                  <select
                    required
                    value={reportForm.address}
                    onChange={(e) => setReportForm({ ...reportForm, address: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
                  >
                    <option value="">시/도 선택</option>
                    {REGIONS.map(region => (
                      <option key={region} value={region}>{region}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    required
                    value={reportForm.detailedLocation}
                    onChange={(e) => setReportForm({ ...reportForm, detailedLocation: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="상세 주소 (예: 종로구 세종대로 209, OO마트 앞)"
                  />
                </div>

                {/* 실종 일시 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">실종 날짜 *</label>
                    <input
                      type="date"
                      required
                      value={reportForm.missingDate}
                      onChange={(e) => setReportForm({ ...reportForm, missingDate: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">실종 시간 *</label>
                    <input
                      type="time"
                      required
                      value={reportForm.missingTime}
                      onChange={(e) => setReportForm({ ...reportForm, missingTime: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 신체 특징 */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">키 (cm)</label>
                    <input
                      type="number"
                      value={reportForm.height}
                      onChange={(e) => setReportForm({ ...reportForm, height: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="예) 165"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-2">체중 (kg)</label>
                    <input
                      type="number"
                      value={reportForm.weight}
                      onChange={(e) => setReportForm({ ...reportForm, weight: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="예) 60"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">착용 의상 *</label>
                  <input
                    type="text"
                    required
                    value={reportForm.clothing}
                    onChange={(e) => setReportForm({ ...reportForm, clothing: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="예) 파란색 티셔츠, 검은색 청바지, 흰색 운동화"
                  />
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-bold text-gray-700 mb-2">기타 특징</label>
                  <textarea
                    value={reportForm.features}
                    onChange={(e) => setReportForm({ ...reportForm, features: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows="3"
                    placeholder="특이사항, 신체적 특징, 소지품 등을 상세히 적어주세요"
                  />
                </div>

                {/* 제보자 정보 */}
                <div className="border-t border-gray-200 pt-4 mb-4">
                  <h3 className="font-bold text-gray-900 mb-3">제보자 정보</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">연락처 *</label>
                      <input
                        type="tel"
                        required
                        value={reportForm.contact}
                        onChange={(e) => setReportForm({ ...reportForm, contact: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="010-0000-0000"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-2">실종자와의 관계 *</label>
                      <select
                        required
                        value={reportForm.relationship}
                        onChange={(e) => setReportForm({ ...reportForm, relationship: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">선택</option>
                        <option value="parent">부모</option>
                        <option value="sibling">형제/자매</option>
                        <option value="relative">친척</option>
                        <option value="friend">친구/지인</option>
                        <option value="guardian">보호자</option>
                        <option value="other">기타</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* 제출 버튼 */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(false)}
                    className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg transition-colors"
                  >
                    제보 접수
                  </button>
                </div>

                <p className="text-xs text-gray-500 text-center mt-4">
                  * 허위 신고 시 법적 책임을 질 수 있습니다
                </p>
              </form>
            </div>
          </div>
        )}

        {/* 상세 정보 모달 */}
        {selectedPerson && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
              <div className="relative">
                <img
                  src={selectedPerson.photo}
                  alt={selectedPerson.name}
                  className="w-full h-64 object-cover rounded-t-2xl"
                />
                <button
                  onClick={() => setSelectedPerson(null)}
                  className="absolute top-4 right-4 p-2 bg-black bg-opacity-50 hover:bg-opacity-70 text-white rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <div className={`absolute top-4 left-4 px-3 py-1 text-white rounded-full text-sm font-medium ${getTypeColor(selectedPerson.type)}`}>
                  {getTypeLabel(selectedPerson.type)}
                </div>
              </div>

              <div className="p-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-4">{selectedPerson.name}</h2>
                
                <div className="space-y-3 mb-6">
                  <div className="flex items-center gap-3 text-gray-700">
                    <User className="w-5 h-5 text-gray-400" />
                    <span>{selectedPerson.age}세 · {selectedPerson.gender === 'M' ? '남성' : '여성'}</span>
                  </div>
                  <div className="flex items-start gap-3 text-gray-700">
                    <MapPin className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                    <span>{selectedPerson.location.address}</span>
                  </div>
                  <div className="flex items-center gap-3 text-gray-700">
                    <Clock className="w-5 h-5 text-gray-400" />
                    <span>{getTimeSince(selectedPerson.missingDate)} 실종</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-gray-900 mb-2">특징</h3>
                  <p className="text-gray-700">{selectedPerson.description}</p>
                </div>

                <div className="flex gap-3">
                  <button className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <Phone className="w-5 h-5" />
                    112 신고
                  </button>
                  <button className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
                    <Share2 className="w-5 h-5" />
                    공유하기
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 로그인 모달 */}
      {showLoginModal && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  <LogIn className="w-7 h-7" />
                  로그인
                </h2>
                <button
                  onClick={() => setShowLoginModal(false)}
                  className="p-2 hover:bg-blue-600 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <p className="text-sm mt-2 text-blue-100">실 이용자로 로그인하여 더 많은 기능을 이용하세요</p>
            </div>

            <form onSubmit={handleLogin} className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-bold text-gray-700 mb-2">이름</label>
                <input
                  type="text"
                  required
                  value={loginForm.name}
                  onChange={(e) => setLoginForm({ ...loginForm, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="이름을 입력하세요"
                />
              </div>

              <div className="mb-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">이메일</label>
                <input
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="example@email.com"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-700">
                  <strong>실 이용자 혜택:</strong>
                </p>
                <ul className="text-sm text-blue-600 mt-2 space-y-1">
                  <li>• 실종자 제보 기록 관리</li>
                  <li>• 맞춤형 알림 설정</li>
                  <li>• 제보 이력 조회</li>
                </ul>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLoginModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-bold rounded-lg transition-colors"
                >
                  로그인
                </button>
              </div>

              <p className="text-xs text-gray-500 text-center mt-4">
                * 데모 버전으로 이름과 이메일만 입력하면 로그인됩니다
              </p>
            </form>
          </div>
        </div>
      )}

      {/* 하단 공지사항 배너 */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 shadow-lg z-10">
        <div className="flex items-center justify-center gap-3 max-w-7xl mx-auto">
          <Info className="w-5 h-5 flex-shrink-0" />
          <div className="flex-1 text-center">
            <div className="transition-opacity duration-500">
              <p className="text-sm font-medium">
                {ANNOUNCEMENTS[currentAnnouncementIndex].text}
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            {ANNOUNCEMENTS.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentAnnouncementIndex(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  currentAnnouncementIndex === index ? 'bg-white w-4' : 'bg-white bg-opacity-50'
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      </div>

      <style>{`
        @keyframes slide-in-right {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        
        .animate-slide-in-right {
          animation: slide-in-right 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}