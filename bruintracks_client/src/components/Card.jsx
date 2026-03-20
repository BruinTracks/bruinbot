import PropTypes from 'prop-types';

export function Card({ children, className }) {
  return (
    <div className={`bg-gray-800 p-4 rounded-2xl shadow-md ${className}`}>
      {children}
    </div>
  );
}

Card.propTypes = {
  children: PropTypes.node,
  className: PropTypes.string
};
