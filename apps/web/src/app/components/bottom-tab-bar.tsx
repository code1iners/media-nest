import { type MouseEvent } from 'react';
import { NavLink, useLocation } from 'react-router';
import { ROUTE_PATHS } from '../constants/route-paths.constant';
import { useNavigationLock } from './navigation-lock-context';
import { PixelIcon, type PixelIconName } from './pixel-art';

/** 하단 탭 메뉴 메타데이터. */
const BOTTOM_TAB_ITEMS = [
  {
    icon: 'video',
    label: '영상 추출',
    path: ROUTE_PATHS.video,
  },
  {
    icon: 'subtitle',
    label: '자막 추출',
    path: ROUTE_PATHS.subtitles,
  },
] as const satisfies Array<{
  /** 탭 아이콘 이름. */
  icon: PixelIconName;
  /** 탭 표시 라벨. */
  label: string;
  /** 이동할 route path. */
  path: string;
}>;

/** 화면 하단에 고정되는 route tab bar. */
export function BottomTabBar() {
  // Hooks.

  /** 현재 브라우저 route 위치. */
  const location = useLocation();
  /** 추출 진행 중 route 이동 차단 상태. */
  const { navigationLocked } = useNavigationLock();

  return (
    <nav className="bottom-tab-bar" aria-label="주요 메뉴">
      {BOTTOM_TAB_ITEMS.map((item) => {
        /** 현재 route와 일치하는 탭인지 여부. */
        const isActive = location.pathname === item.path;
        /** 추출 진행 중 다른 route로 이동하려는지 여부. */
        const blocksNavigation = navigationLocked && !isActive;

        /** 추출 진행 중 route 이동을 막는다. */
        function handleClick(event: MouseEvent<HTMLAnchorElement>) {
          if (!blocksNavigation) {
            return;
          }

          event.preventDefault();
        }

        return (
          <NavLink
            aria-disabled={blocksNavigation}
            className={[
              'bottom-tab-link',
              isActive ? 'is-active' : '',
              blocksNavigation ? 'is-disabled' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={item.path}
            to={item.path}
            onClick={handleClick}
          >
            <PixelIcon name={item.icon} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
