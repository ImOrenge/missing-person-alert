import { useEffect, useCallback, useRef } from 'react';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { toast } from 'react-toastify';
import { useEmergencyStore } from '../stores/emergencyStore';
import { MissingPerson, EmergencyMessage, WebSocketMessage } from '../types';

const WS_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:8080';

export function useEmergencyWebSocket() {
  const addMissingPersons = useEmergencyStore(state => state.addMissingPersons);
  const addEmergencyMessage = useEmergencyStore(state => state.addEmergencyMessage);
  const setConnectionStatus = useEmergencyStore(state => state.setConnectionStatus);

  // 토스트 알림을 보낸 ID 추적
  const notifiedIdsRef = useRef<Set<string>>(new Set());

  // 알림음 재생
  const playAlertSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/emergency-alert.mp3');
      audio.volume = 0.5;
      audio.play().catch((e) => {
        console.log('오디오 재생 실패 (사용자 상호작용 필요):', e.message);
      });
    } catch (error) {
      console.error('알림음 재생 오류:', error);
    }
  }, []);

  // 새로운 실종자 처리
  const handleNewMissingPersons = useCallback((persons: MissingPerson[]) => {
    if (!Array.isArray(persons) || persons.length === 0) return;

    console.log(`🚨 새로운 실종자 ${persons.length}건 수신`);

    // 스토어에 추가
    addMissingPersons(persons);

    // 각 실종자에 대해 알림 표시 (중복 방지)
    let newNotificationCount = 0;

    persons.forEach((person) => {
      // 이미 알림을 보낸 경우 건너뛰기
      if (notifiedIdsRef.current.has(person.id)) {
        console.log(`⏭️  이미 알림 전송됨: ${person.name} (${person.id})`);
        return;
      }

      // 알림 ID 추적에 추가
      notifiedIdsRef.current.add(person.id);
      newNotificationCount++;

      // 긴급 토스트 알림 (10초 후 자동 사라짐)
      toast.error(
        `🚨 새로운 실종자 정보: ${person.name} (${person.age}세) - ${person.location.address}`,
        {
          autoClose: 10000,
          position: 'top-center',
          closeOnClick: true,
          hideProgressBar: false,
          pauseOnHover: true,
          draggable: true,
          toastId: person.id // 같은 ID로 중복 토스트 방지
        }
      );

      // 브라우저 알림
      if (Notification.permission === 'granted') {
        new Notification('실종자 긴급 알림', {
          body: `${person.name} (${person.age}세)님이 ${person.location.address}에서 실종되었습니다.`,
          icon: '/icons/emergency.png',
          requireInteraction: false,
          tag: person.id
        });
      }
    });

    // 새 알림이 있을 때만 알림음 재생
    if (newNotificationCount > 0) {
      console.log(`📢 ${newNotificationCount}건의 새로운 알림 전송됨`);
      playAlertSound();
    }
  }, [addMissingPersons, playAlertSound]);

  // 새로운 긴급재난문자 처리
  const handleNewEmergencyMessages = useCallback((messages: EmergencyMessage[]) => {
    if (!Array.isArray(messages) || messages.length === 0) return;

    console.log(`📢 새로운 재난문자 ${messages.length}건 수신`);

    messages.forEach((message) => {
      addEmergencyMessage(message);

      toast.warning(
        `📢 [${message.region}] ${message.content.substring(0, 50)}...`,
        {
          autoClose: 8000,
          position: 'top-right'
        }
      );
    });
  }, [addEmergencyMessage]);

  const { lastJsonMessage, readyState, sendJsonMessage } = useWebSocket<WebSocketMessage>(
    WS_URL,
    {
      onOpen: () => {
        console.log('✅ WebSocket 연결 성공');
        toast.success('실시간 알림 연결됨', {
          position: 'top-right',
          autoClose: 3000
        });
        setConnectionStatus(true);
      },
      onClose: () => {
        console.log('❌ WebSocket 연결 종료');
        toast.warning('실시간 알림 연결 끊김', {
          position: 'top-right',
          autoClose: 3000
        });
        setConnectionStatus(false);
      },
      onError: (error) => {
        console.error('❌ WebSocket 오류:', error);
        toast.error('연결 오류 발생', {
          position: 'top-right',
          autoClose: 5000
        });
        setConnectionStatus(false);
      },
      shouldReconnect: () => true,
      reconnectAttempts: 10,
      reconnectInterval: (attemptNumber) =>
        Math.min(Math.pow(2, attemptNumber) * 1000, 10000),
      heartbeat: {
        message: JSON.stringify({ type: 'ping' }),
        returnMessage: 'pong',
        timeout: 60000,
        interval: 25000
      }
    }
  );

  // WebSocket 메시지 처리
  useEffect(() => {
    if (!lastJsonMessage) return;

    const message = lastJsonMessage as WebSocketMessage;

    switch (message.type) {
      case 'CONNECTED':
        console.log('서버 연결 확인:', message.message);
        break;

      case 'NEW_MISSING_PERSON':
        handleNewMissingPersons(message.data);
        break;

      case 'NEW_EMERGENCY_MESSAGE':
        handleNewEmergencyMessages(message.data);
        break;

      case 'pong':
        // 하트비트 응답 - 로그 생략
        break;

      default:
        console.log('알 수 없는 메시지 타입:', message.type);
    }
  }, [lastJsonMessage, handleNewMissingPersons, handleNewEmergencyMessages]);

  // 브라우저 알림 권한 요청
  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      console.log('이 브라우저는 알림을 지원하지 않습니다');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        toast.success('알림 권한이 허용되었습니다');
        return true;
      }
    }

    toast.warning('알림 권한이 거부되었습니다. 브라우저 설정에서 변경할 수 있습니다.');
    return false;
  };

  return {
    isConnected: readyState === ReadyState.OPEN,
    connectionState: readyState,
    sendMessage: sendJsonMessage,
    requestNotificationPermission
  };
}
