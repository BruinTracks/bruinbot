import PropTypes from 'prop-types';

export const InputField = ({ setValue, ...props }) => {
  return (
    <input
      {...props}
      onChange={(e) => {
        if (props.type === 'number') {
          setValue(Number(e.target.value));
        } else {
          setValue(e.target.value);
        }
      }}
      className={
        'h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base text-gray-900 text-center placeholder:text-center shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-200'
      }
    ></input>
  );
};

InputField.propTypes = {
  setValue: PropTypes.func.isRequired,
  type: PropTypes.string,
};
