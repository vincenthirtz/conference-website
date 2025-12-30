import React, { useState, forwardRef, JSX } from 'react';
import links from '@/config/links.json';
import Link from 'next/link';
import Dropdown from '../illustration/dropdown';
import { LinkItem } from '../../types/types';
import type { INavDropProp } from '../../types/components';

const NavDrop = forwardRef<HTMLDivElement, INavDropProp>(
  (
    { setDrop, isStaff, staffName, adminLinks, adminLoading, onLogout },
    ref
  ): JSX.Element => {
    const [show, setShow] = useState<string | null>(null);
    const [adminMenuOpen, setAdminMenuOpen] = useState(false);

    return (
      <div
        ref={ref}
        className="z-[99] absolute left-0 top-[74px] w-full h-screen bg-[#1B1130]/90 backdrop-filter backdrop-blur-md"
      >
        <div className="flex flex-col p-5 pb-8 w-full">
          {/* ----------------------------------------------------
              🔐 Bloc Staff (mobile) – même logique que Navbar
             ---------------------------------------------------- */}
          {!adminLoading && (
            <>
              {/* Pas connecté staff → lien Connexion staff */}
              {!isStaff && (
                <div className="mb-6">
                  <Link
                    href="/admin/login"
                    onClick={() => setDrop(false)}
                    className="block text-white rounded-lg border border-purple-400/50 px-4 py-3 text-center font-medium hover:bg-purple-600/30 transition"
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
                        item.ref ? (
                          <Link
                            key={item.ref}
                            href={item.ref}
                            onClick={() => setDrop(false)}
                          >
                            <div className="px-4 py-3 text-white hover:bg-white/20 cursor-pointer">
                              {item.title}
                            </div>
                          </Link>
                        ) : (
                          <div
                            key={item.title}
                            className="px-4 py-2 text-xs uppercase tracking-[0.14em] text-purple-200/80 bg-white/5 border-t border-white/10"
                          >
                            {item.title.replace('— ', '')}
                          </div>
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
          )}

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
