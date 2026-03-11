import React, { useState, forwardRef, JSX } from 'react';
import links from '@/config/links.json';
import Link from 'next/link';
import Dropdown from '../illustration/dropdown';
import { LinkItem } from '../../types/types';
import type { INavDropProp } from '../../types/components';

const NavDrop = forwardRef<HTMLDivElement, INavDropProp>(
  (
    {
      setDrop,
      isStaff,
      staffName,
      adminLinks,
      adminLoading,
      offsetTop = 74,
      onLogout,
    },
    ref
  ): JSX.Element => {
    const [show, setShow] = useState<string | null>(null);
    const [adminMenuOpen, setAdminMenuOpen] = useState(false);
    const [expandedSubMenus, setExpandedSubMenus] = useState<string[]>([]);
    const dropHeight = `calc(100vh - ${offsetTop}px)`;

    const toggleSubMenu = (title: string) => {
      setExpandedSubMenus((prev) =>
        prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
      );
    };

    return (
      <div
        ref={ref}
        className="z-[99] absolute left-0 w-full bg-[#1B1130]/90 backdrop-filter backdrop-blur-md"
        style={{ top: offsetTop, height: dropHeight }}
      >
        <div className="flex flex-col p-5 pb-8 w-full overflow-y-auto" style={{ maxHeight: dropHeight }}>
          {/* ----------------------------------------------------
              🔐 Bloc Staff (mobile) – même logique que Navbar
             ---------------------------------------------------- */}
          <>
              {/* Pas connecté staff → lien Connexion staff */}
              {!isStaff && (
                <div className="mb-6">
                  <Link
                    href="/admin/login"
                    onClick={() => setDrop(false)}
                    className={`block text-white rounded-lg border border-purple-400/50 px-4 py-3 text-center font-medium hover:bg-purple-600/30 transition-all ${adminLoading ? 'opacity-0' : 'opacity-100'}`}
                  >
                    Connexion staff
                  </Link>
                </div>
              )}

              {/* Staff connecté → Menu Admin */}
              {isStaff && (
                <div className="mb-6">
                  <button
                    onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                    className="w-full flex items-center justify-between text-white border border-emerald-400/60 rounded-lg px-4 py-3 hover:bg-emerald-600/20 transition"
                  >
                    <span>{staffName || 'Staff'}</span>
                    <Dropdown
                      fill="white"
                      className={`ml-2 transition-transform duration-500 ${
                        adminMenuOpen ? 'rotate-180' : 'rotate-0'
                      }`}
                    />
                  </button>

                  {adminMenuOpen && (
                    <div className="mt-3 flex flex-col bg-white/10 rounded-lg overflow-hidden border border-white/10">
                      {adminLinks.map((item) =>
                        item.children && item.children.length > 0 ? (
                          <div key={item.title} className="border-t border-white/10 first:border-t-0">
                            <div className="px-4 py-2 text-xs uppercase tracking-[0.14em] text-purple-200/80 bg-white/5">
                              {item.title}
                            </div>
                            {item.children.map((child) => {
                              const hasNestedChildren = child.children && child.children.length > 0;

                              if (hasNestedChildren) {
                                const isExpanded = expandedSubMenus.includes(child.title);
                                return (
                                  <div key={child.title}>
                                    <button
                                      onClick={() => toggleSubMenu(child.title)}
                                      className="w-full px-5 py-3 flex items-center justify-between text-white hover:bg-white/20 transition"
                                    >
                                      <span>{child.title}</span>
                                      <Dropdown
                                        fill="white"
                                        className={`w-3 h-3 transition-transform duration-300 ${
                                          isExpanded ? 'rotate-180' : 'rotate-0'
                                        }`}
                                      />
                                    </button>
                                    {isExpanded && (
                                      <div className="bg-white/5">
                                        {child.children?.map((subChild) => (
                                          <Link
                                            key={subChild.ref}
                                            href={subChild.ref}
                                            onClick={() => setDrop(false)}
                                          >
                                            <div className="pl-10 pr-5 py-2.5 text-sm text-neutral-300 hover:bg-white/10 hover:text-white cursor-pointer">
                                              {subChild.title}
                                            </div>
                                          </Link>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              }

                              return (
                                <Link
                                  key={child.ref}
                                  href={child.ref}
                                  onClick={() => setDrop(false)}
                                >
                                  <div className="px-5 py-3 text-white hover:bg-white/20 cursor-pointer">
                                    {child.title}
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        ) : (
                          <Link
                            key={item.ref || item.title}
                            href={item.ref || '#'}
                            onClick={() => setDrop(false)}
                          >
                            <div className="px-4 py-3 text-white hover:bg-white/20 cursor-pointer">
                              {item.title}
                            </div>
                          </Link>
                        )
                      )}

                      <button
                        onClick={onLogout}
                        className="px-4 py-3 text-left text-red-200 hover:bg-red-500/20 text-sm border-t border-white/10"
                      >
                        Déconnexion
                      </button>
                    </div>
                  )}
                </div>
              )}
          </>

          {/* ----------------------------------------------------
              🌐 Liens publics déjà existants
             ---------------------------------------------------- */}
          {links
            .filter(
              (link) =>
                ![
                  'À propos',
                  'Cast',
                  'Sponsors',
                  'Équipes',
                  'Equipes',
                ].includes(link.title)
            )
            .map((link: LinkItem) => {
              return (
                <Link href={link.ref || '#'} key={link.title}>
                  <div
                    className="min-h-[50px] cursor-pointer"
                    onClick={() =>
                      show === link.title ? setShow(null) : setShow(link.title)
                    }
                  >
                    {link.subMenu ? (
                      <div>
                        <div
                          className="flex items-center text-white"
                          onClick={(e) => e.preventDefault()}
                        >
                          <div>{link.title}</div>
                          <Dropdown
                            fill="white"
                            className={`ml-2 transition-transform duration-500 ${
                              show === link.title ? 'rotate-180' : 'rotate-0'
                            }`}
                          />
                        </div>
                        {show && show === link.title && (
                          <div className="flex flex-col py-6 w-full">
                            {link.subMenu.map((sub) => (
                              <Link href={sub.ref || '#'} key={sub.ref}>
                                <div
                                  onClick={() => setDrop(false)}
                                  className="h-[40px] flex items-center p-6 text-white hover:text-black cursor-pointer gap-2"
                                >
                                  <span>{sub.title}</span>
                                  {sub.badge && (
                                    <span className="inline-flex items-center rounded-full bg-red-500/90 px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide text-white">
                                      {sub.badge}
                                    </span>
                                  )}
                                </div>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div
                        className="text-white"
                        onClick={() => setDrop(false)}
                      >
                        {link.title}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
        </div>
      </div>
    );
  }
);
NavDrop.displayName = 'NavDrop';

export default NavDrop;
