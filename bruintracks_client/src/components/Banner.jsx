import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container, Row, Col } from 'react-bootstrap';
import { ArrowRightCircle } from 'react-bootstrap-icons';
import headerImg from '../assets/headerImg.png'; // Bear image
import GoogleAuthButton from './GoogleAuthButton';
import { motion } from 'framer-motion';

const ROTATING_PHRASES = ['8 AMs.', 'Friday Classes.', 'Stress.'];
const TYPING_PAUSE_MS = 2000;

export const Banner = () => {
  const navigate = useNavigate();
  const [loopNum, setLoopNum] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [text, setText] = useState('');
  const [delta, setDelta] = useState(300 - Math.random() * 100);

  const tick = useCallback(() => {
    const i = loopNum % ROTATING_PHRASES.length;
    const fullText = ROTATING_PHRASES[i];
    const updatedText = isDeleting
      ? fullText.substring(0, text.length - 1)
      : fullText.substring(0, text.length + 1);

    setText(updatedText);

    if (isDeleting) {
      setDelta((prev) => prev / 2);
    }

    if (!isDeleting && updatedText === fullText) {
      setIsDeleting(true);
      setDelta(TYPING_PAUSE_MS);
    } else if (isDeleting && updatedText === '') {
      setIsDeleting(false);
      setLoopNum((prev) => prev + 1);
      setDelta(500);
    }
  }, [isDeleting, loopNum, text]);

  useEffect(() => {
    let ticker = setInterval(() => {
      tick();
    }, delta);

    return () => clearInterval(ticker);
  }, [delta, tick]);

  const handleClick = () => {
    navigate('/Form');
  };

  return (
    <>
      {/* Embedded CSS from banner.css */}
      <style>{`
        /************ Custom Font ************/
        @font-face {
          font-family: Centra;
          src: url('../font/CentraNo2-Bold.ttf');
          font-weight: 700;
        }
        @font-face {
          font-family: Centra;
          src: url('../font/CentraNo2-Medium.ttf');
          font-weight: 500;
        }
        @font-face {
          font-family: Centra;
          src: url('../font/CentraNo2-Book.ttf');
          font-weight: 400;
        }

        /************ Default Css ************/
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
          scroll-padding-top: 75px;
        }

        body {
          font-weight: 400;
          overflow-x: hidden;
          position: relative;
          background-color: #121212 !important;
          color: #fff !important;
          font-family: 'Centra', sans-serif !important;
        }

        h1, h2, h3, h4, h5, h6 {
          margin: 0;
          padding: 0;
          line-height: normal;
        }

        p, a, li, button, ul {
          margin: 0;
          padding: 0;
          line-height: normal;
          text-decoration: none;
        }

        a:hover {
          text-decoration: none;
        }

        img {
          width: 100%;
          height: auto;
        }

        button {
          border: 0;
          background-color: transparent;
        }

        input:focus, textarea:focus, select:focus {
          outline: none;
        }

        @media (min-width:1700px) {
          main .container {
            max-width: 100%;
            padding: 0 150px;
          }
        }

        /************ Banner Css ************/
        .banner {
          margin-top: 0;
          padding: 260px 0 100px 0;
          background-image: url('../banner-bg.png');
          background-position: top center;
          background-size: cover;
        }
        .banner .tagline {
          background: linear-gradient(90.21deg, rgba(119, 137, 193, 0.5) -5.91%, rgba(74, 47, 189, 0.5) 111.58%);
          border: 1px solid rgba(255, 255, 255, 0.5);
          font-size: 23px;
          margin-bottom: 16px;
          display: inline-block;
        }

        .banner-img-container {
          display: flex;
          align-items: flex-start;
          margin-left: auto;
        }

        .banner-row {
          display: flex;
          align-items: center;
        }

        .banner h1 {
          font-size: 80px;
          font-weight: 700;
          letter-spacing: 0.8px;
          line-height: 1;
          margin-bottom: 20px;
          display: block;
          padding-left: 20px;
        }
        .banner button {
          color: #fff;
          font-weight: 700;
          font-size: 30px;
          margin-top: 60px;
          letter-spacing: 0.8px;
          display: flex;
          align-items: center;
          padding-left: 20px;
        }
        .banner button svg {
          font-size: 25px;
          margin-left: 10px;
          transition: 0.3s ease-in-out;
          line-height: 1;
        }
        .banner button:hover svg {
          margin-left: 25px;
        }

        .wrap {
          color: rgb(252, 227, 0);
          white-space: nowrap;
          overflow: hidden;
        }

        .bear-img {
          height: auto;
          width: 100%;
          max-width: 600px;
          transform: scale(1);
          object-fit: contain;
        }
      `}</style>

      <div className="fixed inset-0 bg-gray-900">
        <section
          id="home"
          className="banner min-h-screen w-full flex items-center justify-center"
        >
          <Container className="max-w-7xl mx-auto px-4 py-20">
            <Row className="banner-row flex items-center">
              {/* LEFT 50%: Text */}
              <Col
                xs={12}
                md={6}
                className="flex flex-col justify-center items-start mb-10 md:mb-0 pr-8"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="w-full"
                >
                  <h1 className="text-8xl md:text-[7rem] font-bold text-white leading-tight text-left">
                    Say No to <br />
                    <span
                      className="
                        text-yellow-400 
                        inline-block 
                        w-full
                        break-words
                        whitespace-normal
                        leading-tight
                      "
                    >
                      {text}
                      {/* Blinking cursor */}
                      <span className="cursor">|</span>
                    </span>
                  </h1>
                </motion.div>

                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="mt-8 w-full md:w-auto"
                >
                  <GoogleAuthButton
                    onClick={handleClick}
                    className="
                      bg-blue-600 hover:bg-blue-700 text-white
                      px-8 py-4 rounded-lg transition-colors
                      flex items-center justify-center space-x-3
                      text-2xl font-semibold w-full md:w-auto
                    "
                  >
                    <span>Get Started with Bruinbot!</span>
                    <ArrowRightCircle size={32} />
                  </GoogleAuthButton>
                </motion.div>
              </Col>

              {/* RIGHT 50%: Bear (pushed farther right via extra padding) */}
              <Col
                xs={12}
                md={6}
                className="banner-img-container flex justify-end items-center pl-40"
              >
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5 }}
                  className="w-full flex justify-end"
                >
                  <img
                    src={headerImg}
                    alt="Bear"
                    className="bear-img w-full h-auto object-contain"
                    style={{ zIndex: 1 }}
                  />
                </motion.div>
              </Col>
            </Row>
          </Container>
        </section>
      </div>
    </>
  );
};

export default Banner;