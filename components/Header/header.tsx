import React, { JSX } from 'react';
import Heading from '../Typography/heading';
import Paragraph from '../Typography/paragraph';
import Button from '../Buttons/button';
import ReactSlider from '../Slider/slider';
import Announcement from '../announcement';
import Link from 'next/link';

function Header(): JSX.Element {
  const currentYear = new Date().getFullYear();

  return (
    <div className="relative">
      <div className="container w-full flex items-center justify-center">
        <div className="">
          <div className="flex justify-center w-full mt-32">
            <div className="flex flex-col justify-center items-center w-full">
              <div className="my-10">{/*     <Announcement /> */}</div>
              <div
                className="w-full max-w-[640px] px-4 text-center"
                data-test="landing-heading"
              >
                <Heading
                  className="leading-normal sm:leading-38px tracking-[-3px] sm:tracking-[-0.02em] font-extrabold text-gradient"
                  level="h1"
                  typeStyle="heading-lg"
                >
                  OW WOMEN&apos;S CUP {currentYear}
                </Heading>
              </div>
              <div className="w-full max-w-[640px] px-4 text-center">
                <Paragraph className="mt-[16px]" textColor="text-gray-200">
                  Rejoins le tournoi 100% féminin et francophone sur Overwatch
                </Paragraph>
              </div>
              <div className="mt-[54px] relative flex items-center justify-center">
                <Link href="https://discord.gg/gERSsjC3Vd" target="_blank">
                  <Button type="button" className="w-[250px]">
                    Rejoindre le Discord
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* <div className="mt-24">
        <ReactSlider>
          {cities.map((city) => {
            return <Venue key={city.name} city={city} />;
          })}
        </ReactSlider>
      </div> */}
    </div>
  );
}

export default Header;
