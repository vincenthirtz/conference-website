import React, { JSX } from 'react';
import Link from 'next/link';
import ILink from '../illustration/link';
import socials, { SocialWithIcon } from '../../config/socials';

function Footer(): JSX.Element {
  return (
    <div className="container" data-test="footer">
      <div
        className="w-full flex justify-between items-center p-4 sm:flex-col sm:gap-3"
        data-test="footer-asyncAPI-logo"
      >
        <div className="mt-2 text-[14px] text-gray-100 ">
        <Link href="/rules">
      <div className="hover:underline text-white duration-200 ease-in-out flex items-center">
            <span> Règlement </span>
                <span>
              <ILink className="w-4 ml-2" fill="white" />
            </span>
      </div>
    </Link> 
        </div>
        <div></div>
        <div className="flex items-center justify-between sm:flex-col sm:items-center">
          <div className="text-white text-center">
            Fait avec ❤️ par AsyncAPI contributors. Repris par <a
            href="https://www.twitch.tv/arukdo"
            target="_blank" rel="noreferrer">Arukdo</a>.
          </div>
          <div className="w-[0.9px] h-4 bg-white ml-4 sm:hidden" />
          <div className="ml-4 flex justify-between items-center gap-2 sm:mt-4">
            {socials.map((social: SocialWithIcon) => {
              const IconComponent = social.icon;
              return (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg flex items-center justify-center hover:border-[#AD20E2] duration-150 ease-in-out"
                  data-test={`footer-${social.name}`}
                >
                  <IconComponent className="w-[20px] h-[20px]" fill="white" />
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Footer;
